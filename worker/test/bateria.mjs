// Bateria do Worker dos formulários: corre o Worker VERDADEIRO (wrangler unstable_dev)
// contra um Hostinger e um Resend falsos, que gravam cada pedido. Nenhum email sai.
//
//   cd worker && npm test
//
// Precisa de rede só para o Turnstile: usa a chave de teste da Cloudflare que passa
// sempre (1x0000000000000000000000000000000AA).

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { unstable_dev } from 'wrangler';
import { readFileSync } from 'node:fs';

// ── O Hostinger e o Resend falsos ────────────────────────────────────────────
const CAIXAS_WELDSTAFF = [
    { resourceId: 'AC-jorge', address: 'jorgemaia@weldstaff.pt' },
    { resourceId: 'AC-geral', address: 'geral@weldstaff.pt' },
    { resourceId: 'AC-rh', address: 'rh@weldstaff.pt' },
];
const estado = { caixas: CAIXAS_WELDSTAFF, respostaSend: 204, respostaMe: 200, respostaResend: 200 };
const TOKEN_CERTO = 'Bearer token-de-teste';
let registo = [];

const falso = createServer((req, res) => {
    const partes = [];
    req.on('data', (p) => partes.push(p));
    req.on('end', () => {
        const bruto = Buffer.concat(partes).toString('utf8');
        let corpo = null;
        try { corpo = bruto ? JSON.parse(bruto) : null; } catch { corpo = bruto; }
        registo.push({ metodo: req.method, caminho: req.url, auth: req.headers.authorization, corpo });

        // Como o verdadeiro: sem o token certo, 401 — o /me e o /send não respondem a qualquer um.
        if (req.url.startsWith('/api/') && req.headers.authorization !== TOKEN_CERTO) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ code: 'ERR_UNAUTHORIZED', error: 'Missing or invalid credentials.', params: {} }));
        }
        if (req.method === 'GET' && req.url === '/api/v1/me') {
            if (estado.respostaMe !== 200) { res.writeHead(estado.respostaMe); return res.end('{}'); }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ data: { orderResourceId: 'OR-teste', mailboxes: estado.caixas } }));
        }
        if (req.method === 'POST' && /^\/api\/v1\/mailboxes\/[^/]+\/send$/.test(req.url)) {
            if (estado.respostaSend === 204) { res.writeHead(204); return res.end(); }
            res.writeHead(estado.respostaSend, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ code: 'ERR_TESTE', error: 'falha simulada com geral@carimbodigital.pt', params: {} }));
        }
        if (req.method === 'POST' && req.url === '/emails') {
            if (estado.respostaResend !== 200) { res.writeHead(estado.respostaResend); return res.end('{"message":"falha simulada"}'); }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ id: 'resend-teste' }));
        }
        res.writeHead(404); res.end();
    });
});
await new Promise((r) => falso.listen({ port: 0, host: '::', ipv6Only: false }, r));
const BASE_FALSA = `http://127.0.0.1:${falso.address().port}`;

// ── Afirmações ───────────────────────────────────────────────────────────────
let falhas = 0, certas = 0;
function certo(condicao, descricao, detalhe) {
    if (condicao) { certas++; console.log(`  ✓ ${descricao}`); }
    else { falhas++; console.log(`  ✗ ${descricao}${detalhe !== undefined ? `\n      ${JSON.stringify(detalhe).slice(0, 400)}` : ''}`); }
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sends = () => registo.filter((r) => /\/send$/.test(r.caminho));
const mes = () => registo.filter((r) => r.caminho === '/api/v1/me');

// ── Workers ──────────────────────────────────────────────────────────────────
const SEGREDOS = {
    TURNSTILE_SECRET: '1x0000000000000000000000000000000AA',
    CONTACT_TO_EMAIL: 'geral@weldstaff.pt',
    HOSTINGER_API_TOKEN: 'token-de-teste',
    HOSTINGER_API_BASE: BASE_FALSA,
    RESEND_API_KEY: 're_teste',
    RESEND_API_BASE: BASE_FALSA,
    CONTACT_FROM_EMAIL: 'no-reply@weldstaff.pt',
    EMAIL_FALLBACK: '',
};
async function arrancar(extra = {}) {
    return unstable_dev('src/index.ts', {
        config: 'wrangler.jsonc',
        vars: { ...SEGREDOS, ...extra },
        local: true,
        logLevel: 'error',
        experimental: { disableExperimentalWarning: true },
    });
}
const ORIGEM = { Origin: 'https://weldstaff.pt' };

function contacto(worker, sobrepor = {}) {
    return worker.fetch('http://x/contact', {
        method: 'POST',
        headers: { ...ORIGEM, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'João Silva', email: 'joao.silva@exemplo.pt', phone: '912345678',
            subject: 'Orçamento para soldadura', message: 'Linha 1\nLinha 2 <b>não é HTML</b>',
            turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', website: '', ...sobrepor,
        }),
    });
}
function candidatura(worker, ficheiros, sobrepor = {}) {
    const fd = new FormData();
    const campos = { name: 'Maria Costa', email: 'maria@exemplo.pt', phone: '934000000',
        message: 'Tenho 10 anos de TIG.', website: '', jobTitle: 'Soldador TIG',
        turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', ...sobrepor };
    for (const [k, v] of Object.entries(campos)) fd.append(k, v);
    for (const f of ficheiros) fd.append('file', new Blob([f.bytes], { type: f.tipo }), f.nome);
    return worker.fetch('http://x/apply', { method: 'POST', headers: ORIGEM, body: fd });
}

async function candidaturaPorBlocos(worker, bytesFicheiro, extra = {}) {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: 'Rui', email: 'rui@exemplo.pt', phone: '1', message: '', website: '',
        jobTitle: 'Tubista', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' })) fd.append(k, v);
    for (const b of Array.isArray(bytesFicheiro) ? bytesFicheiro : [bytesFicheiro]) {
        fd.append('file', new Blob([b], { type: 'application/pdf' }), 'cv.pdf');
    }
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const serializado = new Response(fd);
    const corpo = new Uint8Array(await serializado.arrayBuffer());
    const stream = new ReadableStream({ start(c) { for (let i = 0; i < corpo.length; i += 65536) c.enqueue(corpo.slice(i, i + 65536)); c.close(); } });
    return worker.fetch('http://x/apply', { method: 'POST', duplex: 'half', body: stream,
        headers: { ...ORIGEM, 'Content-Type': serializado.headers.get('Content-Type') } });
}

const falhouTudo = [];
try {
    // ═══ 0. A interface e o Worker aceitam os mesmos tipos ═════════════════════
    console.log('\n0. A lista de tipos é a mesma nos três sítios');
    const raiz = new URL('../../', import.meta.url);
    const doWorker = Object.keys(Function(`return ${readFileSync(new URL('worker/src/index.ts', raiz), 'utf8')
        .match(/const TIPOS_ANEXO[^=]*=\s*(\{[\s\S]*?\n\});/)[1]}`)()).sort();
    const tsModal = readFileSync(new URL('src/app/pages/careers/job-application-modal/job-application-modal.ts', raiz), 'utf8');
    const daInterface = Function(`return ${tsModal.match(/const EXTENSOES_ACEITES = (\[[^\]]*\])/)[1]}`)().slice().sort();
    const htmlModal = readFileSync(new URL('src/app/pages/careers/job-application-modal/job-application-modal.html', raiz), 'utf8');
    const doAccept = htmlModal.match(/accept="([^"]+)"/)[1].split(',').map((x) => x.trim().replace(/^\./, '')).sort();
    certo(doWorker.length >= 5 && JSON.stringify(doWorker) === JSON.stringify(daInterface),
        `Worker (TIPOS_ANEXO) = interface (EXTENSOES_ACEITES): ${doWorker.length} extensões`, { doWorker, daInterface });
    certo(JSON.stringify(doWorker) === JSON.stringify(doAccept), 'Worker = `accept` do seletor de ficheiros', { doWorker, doAccept });

    // ═══ 1. Hostinger, caminho normal ═══════════════════════════════════════
    console.log('\n1. Contacto pelo Hostinger');
    let w = await arrancar();
    let r = await contacto(w);
    let j = await r.json();
    certo(r.status === 200 && j.ok === true, 'responde 200 {ok:true}', { status: r.status, j });
    certo(mes().length === 1, 'pergunta ao /me de quem é o token (1 vez)', mes().length);
    certo(sends().length === 1, 'faz exatamente um /send', sends().length);
    let s = sends()[0];
    certo(s?.caminho === '/api/v1/mailboxes/AC-geral/send', 'envia pela caixa de geral@, escolhida pelo endereço (não a primeira da lista)', s?.caminho);
    certo(s?.auth === 'Bearer token-de-teste', 'leva o token no Authorization', s?.auth);
    certo(JSON.stringify(s?.corpo?.to) === '["geral@weldstaff.pt"]', 'destinatário é geral@weldstaff.pt', s?.corpo?.to);
    certo(s?.corpo?.displayName === 'Formulário WeldStaff', 'remetente chama-se «Formulário WeldStaff» (não o nome do visitante)', s?.corpo?.displayName);
    certo(s?.corpo?.subject === '[WeldStaff] Orçamento para soldadura', 'assunto igual ao de antes (os filtros dependem dele)', s?.corpo?.subject);
    certo(!('replyTo' in (s?.corpo ?? {})) && !('from' in (s?.corpo ?? {})) && !('attachments' in (s?.corpo ?? {})),
        'não inventa campos que a API não tem, nem anexos vazios', Object.keys(s?.corpo ?? {}));
    const assuntoContacto = '[WeldStaff] Orçamento para soldadura';
    const mailtoEsperado = `mailto:joao.silva@exemplo.pt?subject=${encodeURIComponent('Re: ' + assuntoContacto)}`;
    certo(s?.corpo?.html.includes(`href="${mailtoEsperado}"`), 'HTML tem o botão «Responder» com o mailto certo', mailtoEsperado);
    certo(s?.corpo?.html.includes('Responder a João Silva</a>'), 'o botão diz «Responder a João Silva»');
    certo(s?.corpo?.html.includes('responde para a própria caixa'), 'HTML avisa que o «Responder» do programa vai para a própria caixa');
    certo(s?.corpo?.text.includes('Responder a João Silva: joao.silva@exemplo.pt') && s?.corpo?.text.includes('responde para a própria caixa'),
        'o texto simples diz o mesmo: endereço e aviso', s?.corpo?.text);
    certo(s?.corpo?.html.includes('&lt;b&gt;não é HTML&lt;/b&gt;') && !s?.corpo?.html.includes('<b>não é HTML</b>'),
        'a mensagem do visitante é escapada no HTML');
    for (const valor of ['912345678', 'Orçamento para soldadura', 'Linha 1\nLinha 2 <b>não é HTML</b>']) {
        certo(s?.corpo?.text.includes(valor), `texto simples inclui «${valor.slice(0, 20)}…»`);
    }

    console.log('\n2. Segundo contacto: o id da caixa fica em cache');
    r = await contacto(w);
    certo(r.status === 200, 'responde 200', r.status);
    certo(mes().length === 1 && sends().length === 2, 'não volta a perguntar ao /me', { me: mes().length, sends: sends().length });

    console.log('\n3. Candidatura com 3 anexos no limite');
    const ficheiros = [
        { nome: 'Currículo João – versão final.pdf', tipo: 'application/pdf', bytes: randomBytes(5 * 1024 * 1024 - 1) },
        { nome: 'certificado.png', tipo: 'image/png', bytes: randomBytes(5 * 1024 * 1024 - 1) },
        { nome: 'carta.docx', tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: randomBytes(5 * 1024 * 1024 - 1) },
    ];
    registo = [];
    r = await candidatura(w, ficheiros);
    j = await r.json();
    certo(r.status === 200 && j.ok === true, 'responde 200 {ok:true}', { status: r.status, j });
    s = sends()[0];
    certo(s?.corpo?.subject === '[Candidatura] Soldador TIG - Maria Costa', 'assunto igual ao de antes', s?.corpo?.subject);
    certo(Array.isArray(s?.corpo?.attachments) && s.corpo.attachments.length === 3, 'leva os 3 anexos', s?.corpo?.attachments?.length);
    ficheiros.forEach((f, i) => {
        const a = s?.corpo?.attachments?.[i];
        certo(a?.filename === f.nome && a?.contentType === f.tipo, `anexo ${i + 1}: nome e tipo «${f.nome}»`, a && { filename: a.filename, contentType: a.contentType });
        certo(a && sha(Buffer.from(a.content, 'base64')) === sha(f.bytes), `anexo ${i + 1}: o base64 devolve exatamente os mesmos bytes (${f.bytes.length} B)`);
    });
    certo(s?.corpo?.text.includes('Anexos: Currículo João – versão final.pdf (5.0 MB), certificado.png (5.0 MB), carta.docx (5.0 MB)'),
        'o corpo lista os anexos', s?.corpo?.text.split('\n').find((l) => l.startsWith('Anexos')));

    const tamanhoJson = JSON.stringify(s?.corpo ?? {}).length;
    certo(tamanhoJson > 20_000_000 && tamanhoJson < 35_000_000, `o pedido ao /send tem ${(tamanhoJson / 1e6).toFixed(1)} MB — o pior caso real, dentro dos 35 MB`, tamanhoJson);

    console.log('\n3b. Tipos e nomes de anexo');
    registo = [];
    r = await candidatura(w, [{ nome: 'cv.pdf', tipo: 'text/html', bytes: Buffer.from('%PDF-1.4') }]);
    s = sends()[0];
    certo(r.status === 200 && s?.corpo?.attachments?.[0]?.contentType === 'application/pdf',
        'o tipo MIME sai da extensão, não do que o browser diz (text/html → application/pdf)', s?.corpo?.attachments?.[0]?.contentType);
    for (const nome of ['fatura.exe', 'cv.html', 'curriculo', 'fotos.zip', 'cv.pdf.js', 'virus.constructor', 'x.__proto__', 'x.tostring']) {
        registo = [];
        r = await candidatura(w, [{ nome, tipo: 'application/pdf', bytes: Buffer.from('x') }]);
        const j2 = await r.json();
        certo(r.status === 415 && j2.error === 'Tipo de ficheiro não aceite' && sends().length === 0, `«${nome}» → 415 e não é enviado`, { status: r.status, j2 });
    }
    for (const nome of ['CV.JPEG', 'foto.heic', 'carta.odt', 'cv.pages']) {
        registo = [];
        r = await candidatura(w, [{ nome, tipo: '', bytes: Buffer.from('x') }]);
        certo(r.status === 200, `«${nome}» é aceite (formatos que se arrastam de um telemóvel ou de um Mac)`, r.status);
    }
    registo = [];
    r = await candidatura(w, [{ nome: 'CV\u202Efdp.xxx.doc', tipo: 'application/msword', bytes: Buffer.from('x') }],
        { name: 'Ana\u202Eamarg' });
    s = sends()[0];
    certo(r.status === 200 && s?.corpo?.attachments?.[0]?.filename === 'CVfdp.xxx.doc',
        'o U+202E sai do nome do ficheiro: «CV‮fdp.xxx.doc» não se mostra como «…pdf»', s?.corpo?.attachments?.[0]?.filename);
    certo(!/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/.test(s?.corpo?.subject ?? '\u202E'), 'nem fica no assunto', s?.corpo?.subject);
    registo = [];
    const nomeLongo = 'Á'.repeat(200) + '📄.pdf';
    r = await candidatura(w, [{ nome: nomeLongo, tipo: 'application/pdf', bytes: Buffer.from('x') }]);
    const nomeEnviado = sends()[0]?.corpo?.attachments?.[0]?.filename ?? '';
    certo(r.status === 200 && nomeEnviado.endsWith('.pdf') && Array.from(nomeEnviado).length <= 124 && !/[\uD800-\uDFFF]/.test(nomeEnviado.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')),
        'um nome enorme é cortado sem perder a extensão nem partir um carácter', nomeEnviado.slice(-20));

    console.log('\n4. Limites dos anexos (os mesmos da interface)');
    registo = [];
    r = await candidatura(w, [1, 2, 3, 4].map((n) => ({ nome: `f${n}.pdf`, tipo: 'application/pdf', bytes: randomBytes(100) })));
    certo(r.status === 413, '4 ficheiros → 413', r.status);
    r = await candidatura(w, [{ nome: 'grande.pdf', tipo: 'application/pdf', bytes: randomBytes(5 * 1024 * 1024) }]);
    certo(r.status === 413, 'um ficheiro de exatamente 5 MiB → 413 (a interface exige menos de 5 MiB)', r.status);
    certo(sends().length === 0, 'nenhum destes chegou ao /send', sends().length);

    // Os dois que respondem antes de ler o corpo inteiro correm cada um num Worker só
    // seu. O proxy local do wrangler (não o Worker) responde 503 «Your worker restarted
    // mid-request» ao pedido SEGUINTE a uma resposta dada com o corpo por ler — em
    // produção cada pedido é independente, e só pedidos forjados passam dos 15 MiB.
    for (const [descricao, enviarGrande] of [
        ['um pedido de 16 MiB com Content-Length → 413 antes de ler', (wx) => candidatura(wx, [{ nome: 'enorme.pdf', tipo: 'application/pdf', bytes: randomBytes(16 * 1024 * 1024) }])],
        ['um envio por blocos (sem Content-Length) de 16 MiB → 413, lido só até ao limite', (wx) => candidaturaPorBlocos(wx, randomBytes(16 * 1024 * 1024))],
        // Três ficheiros válidos e um campo de enchimento: nenhum ficheiro passa os 5 MiB,
        // por isso só a leitura limitada o apanha — ler tudo e verificar depois deixava passar.
        ['por blocos, 3 ficheiros válidos + 1 MiB de enchimento → 413 (só a leitura limitada o vê)',
            (wx) => candidaturaPorBlocos(wx, [0, 1, 2].map(() => randomBytes(5 * 1024 * 1024 - 1)), { enchimento: 'e'.repeat(1024 * 1024) })],
    ]) {
        registo = [];
        const wx = await arrancar();
        const rx = await enviarGrande(wx);
        certo(rx.status === 413 && sends().length === 0, descricao, rx.status);
        await wx.stop();
    }
    registo = [];
    r = await candidaturaPorBlocos(w, Buffer.from('%PDF-1.4 pequeno'));
    certo(r.status === 200 && sends().length === 1, 'um envio por blocos pequeno passa (a leitura limitada não parte o caso normal)', r.status);

    registo = [];
    {
        const wx = await arrancar();
        const rx = await contacto(wx, { message: 'x'.repeat(200 * 1024) });
        certo(rx.status === 413 && sends().length === 0, 'contacto com 200 KiB → 413 (lido só até 128 KiB)', rx.status);
        await wx.stop();
    }

    console.log('\n4b. Campos de texto');
    registo = [];
    r = await contacto(w, { message: 'x'.repeat(20_001) });
    certo(r.status === 400 && (await r.json()).error === 'Campos demasiado longos', 'mensagem com 20 001 caracteres → 400');
    r = await contacto(w, { name: 'N'.repeat(301) });
    certo(r.status === 400, 'nome com 301 caracteres → 400', r.status);
    r = await contacto(w, { message: 'm'.repeat(1000) });
    certo(r.status === 200, 'os 1000 caracteres que a interface deixa escrever passam', r.status);

    console.log('\n5. Entradas maliciosas');
    registo = [];
    r = await contacto(w, { email: 'a?cc=x%40evil.pt@exemplo.pt', subject: 'Olá\r\nBcc: vitima@exemplo.pt' });
    certo(r.status === 200, 'aceita (o endereço passa a validação que já existia)', r.status);
    s = sends()[0];
    const href = s?.corpo?.html.match(/href="([^"]+)"/)?.[1] ?? '';
    certo(href.startsWith('mailto:a%3Fcc%3Dx%2540evil.pt@exemplo.pt?subject='), 'o «?cc=» do endereço fica codificado no mailto, não vira destinatário', href);
    certo(!/[\r\n]/.test(s?.corpo?.subject ?? '\n'), 'o assunto fica numa linha só', s?.corpo?.subject);

    console.log('\n6. Validações que já existiam continuam iguais');
    registo = [];
    r = await contacto(w, { website: 'http://spam' });
    certo(r.status === 400 && (await r.json()).error === 'Bot detected', 'honeypot → 400 «Bot detected»');
    r = await contacto(w, { message: '' });
    certo(r.status === 400 && (await r.json()).error === 'Campos obrigatórios em falta', 'sem mensagem → 400 «Campos obrigatórios em falta»');
    r = await contacto(w, { email: 'isto-nao-e-email' });
    certo(r.status === 400 && (await r.json()).error === 'Email inválido', 'email inválido → 400 «Email inválido»');
    certo(sends().length === 0, 'nenhum destes chegou ao /send', sends().length);

    console.log('\n7. O Hostinger recusa o envio');
    registo = []; estado.respostaSend = 422;
    r = await contacto(w);
    j = await r.json();
    certo(r.status === 502 && j.error === 'Falha ao enviar email', '422 do Hostinger → 502 «Falha ao enviar email»', { status: r.status, j });
    certo(!JSON.stringify(j).includes('carimbodigital') && !('details' in j), 'o erro do Hostinger NÃO chega ao browser', j);
    estado.respostaSend = 401;
    r = await contacto(w);
    certo(r.status === 502, '401 → 502', r.status);
    estado.respostaSend = 204;
    const mesAntes = mes().length;
    r = await contacto(w);
    certo(r.status === 200 && mes().length === mesAntes + 1, 'depois de um 401 volta a perguntar ao /me (a cache caiu)', { status: r.status, me: mes().length - mesAntes });
    estado.respostaSend = 404;
    r = await contacto(w);
    estado.respostaSend = 204;
    const mesAntes404 = mes().length;
    r = await contacto(w);
    certo(r.status === 200 && mes().length === mesAntes404 + 1, 'depois de um 404 (caixa apagada) também volta a perguntar', mes().length - mesAntes404);
    await w.stop();

    console.log('\n7b. O /me falha, ou o token está errado');
    registo = []; estado.respostaMe = 500;
    w = await arrancar();
    r = await contacto(w);
    certo(r.status === 502 && sends().length === 0, '/me com 500 → 502 e nenhum envio', { status: r.status, sends: sends().length });
    await w.stop(); estado.respostaMe = 200;
    registo = [];
    w = await arrancar({ HOSTINGER_API_TOKEN: 'token-errado' });
    r = await contacto(w);
    certo(r.status === 502 && sends().length === 0 && mes().length === 1 && mes()[0].auth === 'Bearer token-errado',
        'token errado → o /me recusa (401) → 502 e nenhum envio', { status: r.status, me: mes().map((x) => x.auth) });
    await w.stop();

    console.log('\n7c. Moradas de teste não valem fora da máquina local');
    registo = [];
    // [::1] chega ao falso (que ouve em IPv6), mas não está na lista — tem de ser ignorado.
    w = await arrancar({ HOSTINGER_API_BASE: `http://[::1]:${falso.address().port}` });
    r = await contacto(w);
    certo(r.status === 502 && registo.length === 0,
        'HOSTINGER_API_BASE fora da lista é ignorada: vai ao Hostinger verdadeiro (que recusa o token falso) e o falso, que estava ao alcance, não recebe nada', { status: r.status, pedidosAoFalso: registo.length });
    await w.stop();

    console.log('\n7e. Reserva: o Hostinger falha e o email segue pelo Resend, com aviso');
    registo = []; estado.respostaSend = 422;
    w = await arrancar({ EMAIL_FALLBACK: 'resend' });
    r = await contacto(w);
    j = await r.json();
    let e3 = registo.find((x) => x.caminho === '/emails');
    certo(r.status === 200 && j.ok === true, 'o visitante vê sucesso: a mensagem foi entregue', { status: r.status, j });
    certo(sends().length === 1 && registo.filter((x) => x.caminho === '/emails').length === 1, 'tentou o Hostinger uma vez e o Resend uma vez', registo.map((x) => x.caminho));
    certo(e3?.corpo?.html.startsWith('<p') && e3.corpo.html.indexOf('chegou pelo Resend (reserva)') < e3.corpo.html.indexOf('Responder a João Silva'),
        'o HTML abre com o aviso da reserva, antes de tudo', e3?.corpo?.html.slice(0, 160));
    certo(e3?.corpo?.text.startsWith('Este email chegou pelo Resend (reserva) porque o envio pelo Hostinger falhou: Hostinger /send respondeu 422'),
        'o texto simples abre com o mesmo aviso e diz porquê (422)', e3?.corpo?.text.slice(0, 140));
    certo(e3?.corpo?.reply_to === 'joao.silva@exemplo.pt' && !e3.corpo.text.includes('própria caixa'),
        'pela reserva há Reply-To, e por isso não leva o aviso do «Responder»', { reply_to: e3?.corpo?.reply_to });
    registo = [];
    r = await candidatura(w, [{ nome: 'cv.pdf', tipo: 'application/pdf', bytes: Buffer.from('%PDF-1.4 reserva') }]);
    e3 = registo.find((x) => x.caminho === '/emails');
    certo(r.status === 200 && Buffer.from(e3?.corpo?.attachments?.[0]?.content ?? '', 'base64').toString() === '%PDF-1.4 reserva',
        'a candidatura chega pela reserva com o anexo intacto', r.status);
    registo = []; estado.respostaResend = 500;
    r = await contacto(w);
    certo(r.status === 502, 'se a reserva também falha → 502', r.status);
    estado.respostaResend = 200; estado.respostaSend = 204;
    await w.stop();
    registo = []; estado.respostaResend = 500;
    w = await arrancar({ EMAIL_PROVIDER: 'resend', EMAIL_FALLBACK: 'resend' });
    r = await contacto(w);
    certo(r.status === 502 && registo.filter((x) => x.caminho === '/emails').length === 1 && sends().length === 0,
        'com EMAIL_PROVIDER=resend a falhar, não há segunda tentativa nem Hostinger', registo.map((x) => x.caminho));
    estado.respostaResend = 200;
    await w.stop();

    console.log('\n7d. Turnstile a sério: com a chave que falha sempre');
    registo = [];
    w = await arrancar({ TURNSTILE_SECRET: '2x0000000000000000000000000000000AA' });
    r = await contacto(w);
    j = await r.json();
    certo(r.status === 403 && j.error === 'Falha na validação anti-bot' && registo.length === 0, 'contacto → 403 e nada é enviado', { status: r.status, j });
    r = await candidatura(w, [{ nome: 'cv.pdf', tipo: 'application/pdf', bytes: Buffer.from('x') }]);
    certo(r.status === 403 && registo.length === 0, 'candidatura → 403 e nada é enviado', r.status);
    await w.stop();

    // ═══ 8. O token é de outra encomenda ═════════════════════════════════════
    console.log('\n8. Token de outra encomenda (a armadilha do Carimbo Digital)');
    registo = []; estado.caixas = [{ resourceId: 'AC-carimbo', address: 'geral@carimbodigital.pt' }];
    w = await arrancar();
    r = await contacto(w);
    j = await r.json();
    certo(r.status === 502 && j.error === 'Falha ao enviar email', 'recusa enviar → 502', { status: r.status, j });
    certo(sends().length === 0, 'NÃO envia pela caixa de outro negócio, mesmo sendo a única que o token vê', sends().map((x) => x.caminho));
    certo(!JSON.stringify(j).includes('carimbodigital'), 'e não diz ao browser que caixas o token vê', j);
    await w.stop();
    estado.caixas = CAIXAS_WELDSTAFF;

    // ═══ 9. O caminho de volta: Resend ═══════════════════════════════════════
    console.log('\n9. EMAIL_PROVIDER=resend (o caminho de volta)');
    registo = [];
    w = await arrancar({ EMAIL_PROVIDER: 'resend' });
    r = await contacto(w);
    certo(r.status === 200, 'responde 200', r.status);
    const e = registo.find((x) => x.caminho === '/emails');
    certo(!!e && sends().length === 0 && mes().length === 0, 'vai ao Resend e não toca no Hostinger', registo.map((x) => x.caminho));
    certo(e?.auth === 'Bearer re_teste' && e?.corpo?.from === 'no-reply@weldstaff.pt', 'leva a chave e o remetente do Resend', e && { auth: e.auth, from: e.corpo.from });
    certo(e?.corpo?.reply_to === 'joao.silva@exemplo.pt', 'mantém o reply_to para o visitante', e?.corpo?.reply_to);
    certo(e?.corpo?.subject === assuntoContacto, 'mesmo assunto', e?.corpo?.subject);
    certo(e?.corpo?.html.includes(`href="${mailtoEsperado}"`), 'tem o botão «Responder» (é útil em qualquer fornecedor)');
    certo(!e?.corpo?.html.includes('própria caixa') && !e?.corpo?.text.includes('própria caixa'),
        'NÃO leva o aviso: no Resend o «Responder» funciona e o aviso seria falso', e?.corpo?.text);
    registo = [];
    r = await candidatura(w, [{ nome: 'cv.pdf', tipo: 'application/pdf', bytes: Buffer.from('%PDF-1.4 teste') }]);
    const e2 = registo.find((x) => x.caminho === '/emails');
    certo(r.status === 200 && e2?.corpo?.attachments?.[0]?.filename === 'cv.pdf'
        && typeof e2.corpo.attachments[0].content === 'string'
        && Buffer.from(e2.corpo.attachments[0].content, 'base64').toString() === '%PDF-1.4 teste',
        'anexos em base64 (o Buffer em JSON ocupava 3,6x e passava os 40 MB do Resend)', e2?.corpo?.attachments?.[0]);
    await w.stop();

    console.log('\n10. EMAIL_PROVIDER com um valor desconhecido');
    registo = [];
    w = await arrancar({ EMAIL_PROVIDER: 'gmail' });
    r = await contacto(w);
    certo(r.status === 502 && registo.length === 0, 'recusa (502) e não contacta ninguém', { status: r.status, pedidos: registo.length });
    await w.stop();
} catch (erro) {
    falhas++; falhouTudo.push(erro);
    console.error('\nA bateria rebentou:', erro);
} finally {
    falso.close();
}

console.log(`\n${certas} certas, ${falhas} falhadas`);
process.exit(falhas ? 1 : 0);
