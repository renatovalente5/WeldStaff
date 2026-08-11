import { Buffer } from 'node:buffer';

export interface Env {
    TURNSTILE_SECRET: string;
    RESEND_API_KEY: string;
    CONTACT_TO_EMAIL: string;
    CONTACT_FROM_EMAIL: string;
    ALLOWED_ORIGIN: string;
}

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
    let body: any;
    try {
        body = await request.json();
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

    const ip = request.headers.get("CF-Connecting-IP") || undefined;
    if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, ip))) {
        return json({ ok: false, error: "Falha na validação anti-bot" }, 403, corsHeaders(allowedOrigin));
    }

    // Send Email
    const html = `
    <h2>Novo pedido de contacto (Weldstaff)</h2>
    <p><b>Nome:</b> ${escapeHtml(name)}</p>
    <p><b>Email:</b> ${escapeHtml(email)}</p>
    <p><b>Telefone:</b> ${escapeHtml(phone || "-")}</p>
    <p><b>Assunto:</b> ${escapeHtml(subject)}</p>
    <hr />
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
    <hr />
    <p style="font-size:12px;color:#666">IP: ${escapeHtml(ip ?? "-")}</p>
  `;

    return sendEmail(env, email, `[Weldstaff] ${subject}`, html, [], allowedOrigin);
}

async function handleApply(request: Request, env: Env, allowedOrigin: string): Promise<Response> {
    const formData = await request.formData();

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

    const ip = request.headers.get("CF-Connecting-IP") || undefined;
    if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, ip))) {
        return json({ ok: false, error: "Falha na validação anti-bot" }, 403, corsHeaders(allowedOrigin));
    }

    // Prepare files
    const attachments = [];
    for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
            // Convert File to ArrayBuffer, then to Buffer for Resend (or array of numbers)
            // Resend Node SDK accepts Buffer, but via fetch we send JSON.
            // Resend API allows 'content' as a number[] or base64 string?
            // Checking Resend API docs: attachments: [{ filename, content: Buffer | string }]
            // Ideally we convert to Buffer. In Workers, we interpret File.

            const arrayBuffer = await value.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            attachments.push({
                filename: value.name,
                content: buffer,
            });
        }
    }

    const html = `
    <h2>Nova Candidatura (Weldstaff)</h2>
    <p><b>Vaga:</b> ${escapeHtml(jobTitle)}</p>
    <p><b>Nome:</b> ${escapeHtml(name)}</p>
    <p><b>Email:</b> ${escapeHtml(email)}</p>
    <p><b>Telefone:</b> ${escapeHtml(phone || "-")}</p>
    <hr />
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
    <hr />
    <p style="font-size:12px;color:#666">IP: ${escapeHtml(ip ?? "-")}</p>
  `;

    return sendEmail(env, email, `[Candidatura] ${jobTitle} - ${name}`, html, attachments, allowedOrigin);
}

async function sendEmail(env: Env, replyTo: string, subject: string, html: string, attachments: any[], allowedOrigin: string) {
    const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: env.CONTACT_FROM_EMAIL,
            to: [env.CONTACT_TO_EMAIL],
            reply_to: replyTo,
            subject: subject,
            html,
            attachments: attachments.length > 0 ? attachments : undefined
        }),
    });

    if (!resendResp.ok) {
        const errText = await resendResp.text().catch(() => "");
        return json(
            { ok: false, error: "Falha ao enviar email", details: errText.slice(0, 300) },
            502,
            corsHeaders(allowedOrigin)
        );
    }

    return json({ ok: true }, 200, corsHeaders(allowedOrigin));
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
