import { Buffer } from 'node:buffer';

export interface Env {
    TURNSTILE_SECRET: string;
    CONTACT_TO_EMAIL: string;
    ALLOWED_ORIGIN: string;

    // Quem envia: "hostinger" (o normal) ou "resend" (o caminho de volta, enquanto o
    // Hostinger não estiver provado em produção). Vive no wrangler.jsonc.
    EMAIL_PROVIDER?: string;

    // Hostinger Mail API. O token é da encomenda de email weldstaff.pt (hPanel >
    // Emails > weldstaff.pt > Programadores > Chaves de API) e é um segredo.
    HOSTINGER_API_TOKEN?: string;
    // A caixa que envia. Tem de estar no âmbito do token — ver resolverCaixa().
    HOSTINGER_SENDER?: string;
    // Só para testes locais contra um servidor falso; em produção fica vazio.
    HOSTINGER_API_BASE?: string;

    // Resend (caminho de volta).
    RESEND_API_KEY?: string;
    CONTACT_FROM_EMAIL?: string;
    // Só para testes locais; em produção fica vazio.
    RESEND_API_BASE?: string;
}

// Os mesmos limites da interface (job-application-modal.ts): até 3 ficheiros, cada um
// com menos de 5 MiB. A interface já os impõe; o Worker repete-os porque o pedido
// pode não vir dela. Em base64 os 15 MiB passam a ~20 MiB, dentro dos 25 MB por anexo
// e 35 MB por mensagem do plano Starter Business Email do Hostinger.
const MAX_FICHEIROS = 3;
const MAX_BYTES_FICHEIRO = 5 * 1024 * 1024;
const MAX_BYTES_PEDIDO = MAX_FICHEIROS * MAX_BYTES_FICHEIRO + 256 * 1024;

// Texto: muito acima do que os formulários deixam escrever (a mensagem do contacto
// tem 1000 caracteres), só para que um pedido forjado não rebente a memória depois do
// escapeHtml, que pode multiplicar o tamanho por seis.
const MAX_CARACTERES_MENSAGEM = 20_000;
const MAX_CARACTERES_CAMPO = 300;

// Tipos de anexo aceites, pela extensão. A MESMA lista está em
// src/app/pages/careers/job-application-modal/job-application-modal.ts (EXTENSOES_ACEITES)
// e no `accept` do .html — a bateria falha se divergirem. O Resend recusava executáveis por conta
// própria; o Hostinger não o garante, e o email chega à caixa da empresa COM a
// própria geral@ como remetente — um .exe ou um .html daqui seria phishing perfeito.
// A lista é larga de propósito: o `accept` da interface só vale para o seletor, e
// quem arrasta um ficheiro pode trazer um .jpeg, um .heic do iPhone ou um .odt.
// O tipo MIME sai daqui e não do browser, que o deixa escolher a quem envia.
const TIPOS_ANEXO: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    odt: "application/vnd.oasis.opendocument.text",
    rtf: "application/rtf",
    txt: "text/plain",
    pages: "application/vnd.apple.pages",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    heic: "image/heic",
    heif: "image/heif",
    webp: "image/webp",
};

const USER_AGENT = "weld-staff-api/1.0 (+https://weldstaff.pt)";

// O contacto é JSON pequeno: 20 000 caracteres de mensagem, mesmo todos de 4 bytes, cabem.
const MAX_BYTES_CONTACTO = 128 * 1024;

// O nome que aparece como remetente. NÃO pode ser o nome do visitante: a API do
// Hostinger não aceita Reply-To, por isso o «Responder» do programa de email vai para
// a própria caixa — e com o nome do candidato à frente parecia ir para ele.
const NOME_REMETENTE = 'Formulário WeldStaff';

type Fornecedor = 'hostinger' | 'resend';

type Anexo = { filename: string; contentType: string; bytes: ArrayBuffer };

type Mensagem = {
    replyTo: string;
    subject: string;
    html: string;
    text: string;
    anexos: Anexo[];
};

class ErroEnvio extends Error {}

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
    });
}

function corsHeaders(origin: string) {
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(input: string) {
    return input
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/**
 * Para o que vai parar a um cabeçalho (assunto, nome de ficheiro): uma linha só, e sem
 * caracteres de controlo nem de formatação. Os de formatação incluem o U+202E, que inverte
 * o texto à vista: «CV\u202Efdp.xxx.doc» aparecia no email como «CVcod.xxx.pdf» — um Word
 * a fazer-se passar por PDF, enviado pela própria geral@.
 */
function umaLinha(input: string) {
    return input.replace(/[\r\n]+/g, " ").replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
}

/**
 * Nome de ficheiro seguro para um cabeçalho, cortado sem perder a extensão e sem
 * partir um carácter a meio (o slice() de JS corta pares substitutos).
 */
function nomeDeAnexo(original: string, extensao: string) {
    const limpo = umaLinha(original).replace(/["\\/]/g, "_");
    const base = Array.from(limpo.slice(0, limpo.length - extensao.length - 1));
    return (base.slice(0, 120).join("") || "anexo") + "." + extensao;
}

function extensaoDe(nome: string) {
    const ponto = nome.lastIndexOf(".");
    return ponto > 0 ? nome.slice(ponto + 1).toLowerCase() : "";
}

/**
 * Lê o corpo até `max` bytes e desiste logo que passe. O Content-Length não chega:
 * um envio por blocos (chunked) não o traz, e sem isto o formData() lia tudo para
 * memória antes de qualquer verificação.
 */
async function lerCorpoLimitado(request: Request, max: number): Promise<ArrayBuffer | null> {
    if (!request.body) return new ArrayBuffer(0);
    const leitor = request.body.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) {
            // Parar de ler e responder. Não cancelar o stream: cancelá-lo aborta o pedido
            // inteiro e o browser recebia um 503 em vez do 413.
            leitor.releaseLock();
            return null;
        }
        partes.push(value);
    }
    const tudo = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) { tudo.set(p, pos); pos += p.byteLength; }
    return tudo.buffer;
}

/**
 * As moradas de teste só valem para a máquina local. Em produção, um valor posto por
 * engano mandava o token e os CVs para outro sítio — por isso é ignorado.
 */
function baseDaApi(pedida: string | undefined, oficial: string) {
    if (!pedida) return oficial;
    try {
        const u = new URL(pedida);
        if (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) {
            return pedida.replace(/\/+$/, "");
        }
    } catch { /* cai para a oficial */ }
    console.warn(`Morada de API ignorada (só localhost é aceite): ${pedida}`);
    return oficial;
}

function qualFornecedor(env: Env): Fornecedor {
    const valor = (env.EMAIL_PROVIDER || "hostinger").trim().toLowerCase();
    if (valor === "hostinger" || valor === "resend") return valor;
    throw new ErroEnvio(`EMAIL_PROVIDER desconhecido: «${valor}»`);
}

/**
 * mailto: com o endereço do visitante e o assunto já preenchido. As duas metades do
 * endereço são codificadas à parte: um «?» ou um «&» na parte local (o isValidEmail
 * deixa passar) acrescentaria destinatários ao email que o escritório vai escrever.
 */
function ligacaoResponder(email: string, assunto: string) {
    const arroba = email.lastIndexOf("@");
    const endereco =
        encodeURIComponent(email.slice(0, arroba)) + "@" + encodeURIComponent(email.slice(arroba + 1));
    return `mailto:${endereco}?subject=${encodeURIComponent("Re: " + assunto)}`;
}

/**
 * O HTML e o texto simples saem dos mesmos dados, para dizerem sempre o mesmo.
 * O aviso sobre o «Responder» só aparece quando é verdade: no Resend o Reply-To
 * funciona e o aviso seria falso.
 */
function montarCorpo(opcoes: {
    titulo: string;
    campos: [string, string][];
    mensagem: string;
    ip: string;
    visitante: { nome: string; email: string };
    assunto: string;
    semReplyTo: boolean;
}) {
    const { titulo, campos, mensagem, ip, visitante, assunto, semReplyTo } = opcoes;
    const mailto = ligacaoResponder(visitante.email, assunto);
    const aviso = `Este email foi enviado pelo formulário do site. O «Responder» do programa de email responde para a própria caixa, não para ${visitante.nome}: use o botão acima ou escreva para ${visitante.email}.`;

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">
    <p style="margin:0 0 12px"><a href="${escapeHtml(mailto)}" style="display:inline-block;background:#0b5cad;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold">Responder a ${escapeHtml(visitante.nome)}</a></p>
    ${semReplyTo ? `<p style="margin:0 0 16px;font-size:12px;color:#8a1c1c">${escapeHtml(aviso)}</p>` : ""}
    <h2>${escapeHtml(titulo)}</h2>
    ${campos.map(([rotulo, valor]) => `<p><b>${escapeHtml(rotulo)}:</b> ${escapeHtml(valor)}</p>`).join("\n    ")}
    <hr />
    <p style="white-space:pre-wrap">${escapeHtml(mensagem || "-")}</p>
    <hr />
    <p style="font-size:12px;color:#666">IP: ${escapeHtml(ip)}</p>
    </div>
  `;

    const text = [
        titulo,
        "",
        `Responder a ${visitante.nome}: ${visitante.email}`,
        ...(semReplyTo ? [aviso] : []),
        "",
        ...campos.map(([rotulo, valor]) => `${rotulo}: ${valor}`),
        "",
        mensagem || "-",
        "",
        `IP: ${ip}`,
    ].join("\n");

    return { html, text };
}

async function verifyTurnstile(token: string, secret: string, ip?: string): Promise<boolean> {
    const verifyResp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            secret: secret,
            response: token,
            ...(ip ? { remoteip: ip } : {}),
        }),
    });

    const verifyData = await verifyResp.json<any>().catch(() => null);
    return !!verifyData?.success;
}

async function handleContact(request: Request, env: Env, allowedOrigin: string): Promise<Response> {
    const corpoBruto = await lerCorpoLimitado(request, MAX_BYTES_CONTACTO);
    if (corpoBruto === null) {
        return json({ ok: false, error: "Pedido demasiado grande" }, 413, corsHeaders(allowedOrigin));
    }

    let body: any;
    try {
        body = JSON.parse(new TextDecoder().decode(corpoBruto));
    } catch {
        return json({ ok: false, error: "JSON inválido" }, 400, corsHeaders(allowedOrigin));
    }

    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const subject = String(body?.subject ?? "Pedido de contacto").trim();
    const message = String(body?.message ?? "").trim();
    const turnstileToken = String(body?.turnstileToken ?? "").trim();
    const website = String(body?.website ?? "").trim(); // Honeypot

    if (website) return json({ ok: false, error: "Bot detected" }, 400, corsHeaders(allowedOrigin));

    if (!name || !email || !message || !turnstileToken) {
        return json({ ok: false, error: "Campos obrigatórios em falta" }, 400, corsHeaders(allowedOrigin));
    }

    if (!isValidEmail(email)) return json({ ok: false, error: "Email inválido" }, 400, corsHeaders(allowedOrigin));

    if (message.length > MAX_CARACTERES_MENSAGEM
        || [name, email, phone, subject].some((c) => c.length > MAX_CARACTERES_CAMPO)) {
        return json({ ok: false, error: "Campos demasiado longos" }, 400, corsHeaders(allowedOrigin));
    }

    const ip = request.headers.get("CF-Connecting-IP") || undefined;
    if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, ip))) {
        return json({ ok: false, error: "Falha na validação anti-bot" }, 403, corsHeaders(allowedOrigin));
    }

    // O assunto fica exatamente como era: os filtros da caixa do Hostinger apanham-no.
    const assunto = umaLinha(`[WeldStaff] ${subject}`);

    return enviar(env, allowedOrigin, (fornecedor) => ({
        replyTo: email,
        subject: assunto,
        anexos: [],
        ...montarCorpo({
            titulo: "Novo pedido de contacto (WeldStaff)",
            campos: [
                ["Nome", name],
                ["Email", email],
                ["Telefone", phone || "-"],
                ["Assunto", subject],
            ],
            mensagem: message,
            ip: ip ?? "-",
            visitante: { nome: name, email },
            assunto,
            semReplyTo: fornecedor === "hostinger",
        }),
    }));
}

async function handleApply(request: Request, env: Env, allowedOrigin: string): Promise<Response> {
    // Recusar antes de ler o corpo: um pedido enorme lido para memória rebentava o isolate.
    const tamanhoDeclarado = Number(request.headers.get("Content-Length") || 0);
    if (tamanhoDeclarado > MAX_BYTES_PEDIDO) {
        return json({ ok: false, error: "Anexos demasiado grandes" }, 413, corsHeaders(allowedOrigin));
    }

    const corpoBruto = await lerCorpoLimitado(request, MAX_BYTES_PEDIDO);
    if (corpoBruto === null) {
        return json({ ok: false, error: "Anexos demasiado grandes" }, 413, corsHeaders(allowedOrigin));
    }

    let formData: FormData;
    try {
        formData = await new Response(corpoBruto, {
            headers: { "Content-Type": request.headers.get("Content-Type") || "" },
        }).formData();
    } catch {
        return json({ ok: false, error: "Pedido inválido" }, 400, corsHeaders(allowedOrigin));
    }

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const jobTitle = String(formData.get("jobTitle") ?? "Candidatura Espontânea").trim();
    const message = String(formData.get("message") ?? "").trim();
    const turnstileToken = String(formData.get("turnstileToken") ?? "").trim();
    const website = String(formData.get("website") ?? "").trim(); // Honeypot

    if (website) return json({ ok: false, error: "Bot detected" }, 400, corsHeaders(allowedOrigin));

    if (!name || !email || !turnstileToken) {
        return json({ ok: false, error: "Campos obrigatórios em falta" }, 400, corsHeaders(allowedOrigin));
    }

    if (!isValidEmail(email)) return json({ ok: false, error: "Email inválido" }, 400, corsHeaders(allowedOrigin));

    if (message.length > MAX_CARACTERES_MENSAGEM
        || [name, email, phone, jobTitle].some((c) => c.length > MAX_CARACTERES_CAMPO)) {
        return json({ ok: false, error: "Campos demasiado longos" }, 400, corsHeaders(allowedOrigin));
    }

    const ficheiros: File[] = [];
    for (const [, value] of formData.entries()) {
        if (value instanceof File && value.size > 0) ficheiros.push(value);
    }
    if (ficheiros.length > MAX_FICHEIROS) {
        return json({ ok: false, error: "Demasiados anexos" }, 413, corsHeaders(allowedOrigin));
    }
    if (ficheiros.some((f) => f.size >= MAX_BYTES_FICHEIRO)) {
        return json({ ok: false, error: "Anexos demasiado grandes" }, 413, corsHeaders(allowedOrigin));
    }
    // Object.hasOwn e não `in`: com `in`, um ficheiro «x.constructor» passava pela herança do Object.
    if (ficheiros.some((f) => !Object.hasOwn(TIPOS_ANEXO, extensaoDe(f.name)))) {
        return json({ ok: false, error: "Tipo de ficheiro não aceite" }, 415, corsHeaders(allowedOrigin));
    }

    const ip = request.headers.get("CF-Connecting-IP") || undefined;
    if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, ip))) {
        return json({ ok: false, error: "Falha na validação anti-bot" }, 403, corsHeaders(allowedOrigin));
    }

    const anexos: Anexo[] = [];
    for (const f of ficheiros) {
        const extensao = extensaoDe(f.name);
        anexos.push({
            filename: nomeDeAnexo(f.name, extensao),
            contentType: TIPOS_ANEXO[extensao],
            bytes: await f.arrayBuffer(),
        });
    }

    const assunto = umaLinha(`[Candidatura] ${jobTitle} - ${name}`);
    const listaAnexos = anexos.length
        ? anexos.map((a) => `${a.filename} (${(a.bytes.byteLength / 1024 / 1024).toFixed(1)} MB)`).join(", ")
        : "nenhum";

    return enviar(env, allowedOrigin, (fornecedor) => ({
        replyTo: email,
        subject: assunto,
        anexos,
        ...montarCorpo({
            titulo: "Nova Candidatura (WeldStaff)",
            campos: [
                ["Vaga", jobTitle],
                ["Nome", name],
                ["Email", email],
                ["Telefone", phone || "-"],
                ["Anexos", listaAnexos],
            ],
            mensagem: message,
            ip: ip ?? "-",
            visitante: { nome: name, email },
            assunto,
            semReplyTo: fornecedor === "hostinger",
        }),
    }));
}

/**
 * Envia e responde ao browser. Os pormenores de uma falha vão para os logs do Worker
 * e não para a resposta: o erro do Hostinger pode listar as caixas que o token vê.
 */
async function enviar(
    env: Env,
    allowedOrigin: string,
    montar: (fornecedor: Fornecedor) => Mensagem,
): Promise<Response> {
    let fornecedor: Fornecedor | "?" = "?";
    try {
        fornecedor = qualFornecedor(env);
        const mensagem = montar(fornecedor);
        if (fornecedor === "hostinger") await enviarPeloHostinger(env, mensagem);
        else await enviarPeloResend(env, mensagem);
    } catch (erro) {
        console.error(`Envio falhou (${fornecedor}):`, erro instanceof Error ? erro.message : erro);
        return json({ ok: false, error: "Falha ao enviar email" }, 502, corsHeaders(allowedOrigin));
    }
    return json({ ok: true }, 200, corsHeaders(allowedOrigin));
}

// Sobrevive entre pedidos enquanto o isolate viver: poupa um GET /me por envio.
let caixaEmCache: { remetente: string; id: string } | null = null;

/**
 * O id da caixa que envia, emparelhado pelo ENDEREÇO declarado em HOSTINGER_SENDER.
 * Sem atalho de «se o token só vê uma caixa, é essa»: um token de outra encomenda
 * também só vê uma — e mandava os formulários da WeldStaff pela caixa de outro negócio.
 */
async function resolverCaixa(env: Env, base: string, token: string): Promise<string> {
    const remetente = (env.HOSTINGER_SENDER || "").trim().toLowerCase();
    if (!remetente) throw new ErroEnvio("HOSTINGER_SENDER não está definido");
    if (caixaEmCache?.remetente === remetente) return caixaEmCache.id;

    const resp = await fetch(`${base}/api/v1/me`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!resp.ok) {
        const texto = await resp.text().catch(() => "");
        throw new ErroEnvio(`Hostinger GET /me respondeu ${resp.status}: ${texto.slice(0, 300)}`);
    }
    const dados = await resp.json<any>().catch(() => null);
    const caixas: { resourceId?: string; address?: string }[] = Array.isArray(dados?.data?.mailboxes)
        ? dados.data.mailboxes
        : [];
    const caixa = caixas.find((c) => String(c.address ?? "").toLowerCase() === remetente);
    if (!caixa?.resourceId) {
        const vistas = caixas.map((c) => c.address).join(", ") || "nenhuma";
        throw new ErroEnvio(`O token não gere ${remetente}. Caixas que vê: ${vistas}`);
    }
    if (caixas.length > 1) {
        // Não há permissão «só enviar»: este token lê e apaga tudo nestas caixas.
        console.warn(`O token do Worker abrange ${caixas.length} caixas; basta-lhe ${remetente}. Restringir a chave no hPanel.`);
    }
    caixaEmCache = { remetente, id: caixa.resourceId };
    return caixa.resourceId;
}

async function enviarPeloHostinger(env: Env, m: Mensagem): Promise<void> {
    const token = env.HOSTINGER_API_TOKEN;
    if (!token) throw new ErroEnvio("HOSTINGER_API_TOKEN não está definido");
    const base = baseDaApi(env.HOSTINGER_API_BASE, "https://api.mail.hostinger.com");
    const caixa = await resolverCaixa(env, base, token);

    // Sem replyTo nem from: a API não os tem (spec 1.1.0, SDK 1.19.3). O remetente é
    // sempre a caixa do caminho, e fica uma cópia na pasta Enviados dela.
    const corpo: Record<string, unknown> = {
        to: [env.CONTACT_TO_EMAIL],
        displayName: NOME_REMETENTE,
        subject: m.subject,
        html: m.html,
        text: m.text,
    };
    if (m.anexos.length) {
        corpo.attachments = m.anexos.map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            content: Buffer.from(a.bytes).toString("base64"),
        }));
    }

    const resp = await fetch(`${base}/api/v1/mailboxes/${encodeURIComponent(caixa)}/send`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(corpo),
    });

    if (!resp.ok) {
        // Token revogado, caixa trocada ou apagada: o id em cache deixa de valer.
        if (resp.status === 401 || resp.status === 403 || resp.status === 404) caixaEmCache = null;
        const texto = await resp.text().catch(() => "");
        throw new ErroEnvio(`Hostinger /send respondeu ${resp.status}: ${texto.slice(0, 500)}`);
    }
}

// O caminho de volta. Os anexos seguem em base64: como Buffer serializado em JSON
// ({"type":"Buffer","data":[…]}) ocupavam ~3,6x, e 15 MB de CVs davam ~54 MB — acima
// dos 40 MB que o Resend aceita. Já era assim em produção antes da troca.
async function enviarPeloResend(env: Env, m: Mensagem): Promise<void> {
    if (!env.RESEND_API_KEY) throw new ErroEnvio("RESEND_API_KEY não está definido");
    const base = baseDaApi(env.RESEND_API_BASE, "https://api.resend.com");
    const resp = await fetch(`${base}/emails`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: env.CONTACT_FROM_EMAIL,
            to: [env.CONTACT_TO_EMAIL],
            reply_to: m.replyTo,
            subject: m.subject,
            html: m.html,
            text: m.text,
            attachments: m.anexos.length > 0
                ? m.anexos.map((a) => ({ filename: a.filename, content: Buffer.from(a.bytes).toString("base64") }))
                : undefined,
        }),
    });

    if (!resp.ok) {
        const texto = await resp.text().catch(() => "");
        throw new ErroEnvio(`Resend respondeu ${resp.status}: ${texto.slice(0, 300)}`);
    }
}


export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const origin = request.headers.get("Origin") || "";
        const allowedOrigins = (env.ALLOWED_ORIGIN || "https://weldstaff.pt").split(",").map(s => s.trim());

        // Check if the request origin is in the allowed list
        let isAllowed = allowedOrigins.includes(origin);

        // Allow localhost for development
        if (!isAllowed && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
            isAllowed = true;
        }

        // Determine which origin to return in CORS headers
        // If allowed, echo the origin. If not, fallback to the first allowed origin (or empty)
        const effectiveOrigin = isAllowed ? origin : allowedOrigins[0];

        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders(effectiveOrigin),
            });
        }

        // Verify allowed origin for POST
        if (request.method === "POST" && !isAllowed) {
            return json({ ok: false, error: "Origin not allowed" }, 403, corsHeaders(effectiveOrigin));
        }

        const url = new URL(request.url);

        // Domain Redirection: *.com -> .pt
        if (url.hostname.includes("weldstaff.com") || url.hostname.includes("weeldstaff.com")) {
            return Response.redirect("https://weldstaff.pt" + url.pathname + url.search, 301);
        }

        if (request.method === "POST" && url.pathname.endsWith("/contact")) {
            return handleContact(request, env, effectiveOrigin);
        }

        if (request.method === "POST" && url.pathname.endsWith("/apply")) {
            return handleApply(request, env, effectiveOrigin);
        }

        return new Response("Not Found", { status: 404 });
    },
};
