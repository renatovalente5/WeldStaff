// Corre antes de `wrangler deploy` (ver "deploy" no package.json). Recusa publicar se
// faltar um segredo de que o fornecedor escolhido precisa: publicar o código do
// Hostinger sem HOSTINGER_API_TOKEN deixava os dois formulários a dar 502.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** JSON com comentários, sem estragar os "//" que vivem dentro das strings (URLs). */
function lerJsonc(texto) {
    let saida = '', dentro = false, escape = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i], n = texto[i + 1];
        if (dentro) {
            saida += c;
            if (escape) escape = false;
            else if (c === '\\') escape = true;
            else if (c === '"') dentro = false;
        } else if (c === '"') { dentro = true; saida += c; }
        else if (c === '/' && n === '/') { while (i < texto.length && texto[i] !== '\n') i++; saida += '\n'; }
        else if (c === '/' && n === '*') { i += 2; while (i < texto.length && !(texto[i] === '*' && texto[i + 1] === '/')) i++; i++; }
        else saida += c;
    }
    return JSON.parse(saida.replace(/,(\s*[}\]])/g, '$1'));
}

const config = lerJsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const fornecedor = String(config.vars?.EMAIL_PROVIDER ?? 'hostinger').toLowerCase();

const PRECISA = {
    hostinger: ['TURNSTILE_SECRET', 'CONTACT_TO_EMAIL', 'HOSTINGER_API_TOKEN'],
    resend: ['TURNSTILE_SECRET', 'CONTACT_TO_EMAIL', 'RESEND_API_KEY', 'CONTACT_FROM_EMAIL'],
};
if (!PRECISA[fornecedor]) {
    console.error(`✗ EMAIL_PROVIDER desconhecido no wrangler.jsonc: «${fornecedor}»`);
    process.exit(1);
}
if (fornecedor === 'hostinger' && !config.vars?.HOSTINGER_SENDER) {
    console.error('✗ Falta HOSTINGER_SENDER nas vars do wrangler.jsonc.');
    process.exit(1);
}

let nomes;
try {
    const bruto = execFileSync('npx', ['--no-install', 'wrangler', 'secret', 'list', '--format', 'json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    nomes = JSON.parse(bruto.slice(bruto.indexOf('['))).map((s) => s.name);
} catch (erro) {
    console.error('✗ Não consegui ler os segredos do Worker (wrangler secret list). Publicar às cegas não.');
    console.error(String(erro.stderr || erro.message).split('\n').slice(-5).join('\n'));
    process.exit(1);
}

const faltam = PRECISA[fornecedor].filter((n) => !nomes.includes(n));
if (faltam.length) {
    console.error(`✗ EMAIL_PROVIDER=${fornecedor}, mas faltam segredos no Worker: ${faltam.join(', ')}`);
    console.error(`  Pôr primeiro, por exemplo: pbpaste | npx wrangler secret put ${faltam[0]}`);
    process.exit(1);
}
const deTeste = ['HOSTINGER_API_BASE', 'RESEND_API_BASE'].filter((n) => nomes.includes(n) || config.vars?.[n]);
if (deTeste.length) console.warn(`⚠ ${deTeste.join(', ')} são só para testes locais; em produção o Worker ignora-os.`);

console.log(`✓ EMAIL_PROVIDER=${fornecedor}; segredos presentes: ${PRECISA[fornecedor].join(', ')}`);
