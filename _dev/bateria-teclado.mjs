// Bateria de teclado das candidaturas (/careers): conduz um Chrome sem interface com
// teclas VERDADEIRAS pelo protocolo de depuração — Tab, Enter, Espaço e Escape com o
// keyCode certo. Um .click() de JavaScript ou uma tecla sem keyCode passam onde uma
// pessoa não passa; isto não.
//
//   npm run build && node _dev/bateria-teclado.mjs
//
// Serve o dist/ numa porta sorteada. Não envia candidatura nenhuma. A secção 15 percorre
// as línguas (/en, /fr, /es): o seletor, as ligações, a preferência guardada e o 404.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { abrirChrome, novoSeparador, esperar } from './chrome.mjs';

const RAIZ = resolve(new URL('..', import.meta.url).pathname, 'dist/weld-staff/browser');
if (!existsSync(join(RAIZ, 'careers/index.html'))) {
    console.error('Falta o build: npm run build'); process.exit(1);
}

// ── Servir o dist como o GitHub Pages ────────────────────────────────────────
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain' };
// A secção 15 atrasa as traduções para apanhar texto que pisque antes de a língua chegar.
let atrasoDasTraducoes = 0;
const servidor = createServer((req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = join(RAIZ, caminho);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) f = join(RAIZ, 'index.csr.html');
    const responder = () => {
        res.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream' });
        res.end(readFileSync(f));
    };
    if (atrasoDasTraducoes && caminho.startsWith('/assets/i18n/')) setTimeout(responder, atrasoDasTraducoes);
    else responder();
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

// ── Afirmações ───────────────────────────────────────────────────────────────
let certas = 0, falhas = 0;
function certo(cond, descricao, detalhe) {
    if (cond) { certas++; console.log(`  ✓ ${descricao}`); }
    else { falhas++; console.log(`  ✗ ${descricao}${detalhe !== undefined ? `\n      ${JSON.stringify(detalhe).slice(0, 300)}` : ''}`); }
}

const { enviar, fechar } = await abrirChrome();
const excecoes = [];
try {
    const { sessionId: s } = await novoSeparador(enviar);
    enviar.ouvintes.add((m) => { if (m.method === 'Runtime.exceptionThrown' && m.sessionId === s) excecoes.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text); });
    await enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, s);
    await enviar('DOM.enable', {}, s);
    await enviar('Accessibility.enable', {}, s);

    const js = async (expr) => {
        const r = await enviar('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }, s);
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
    };
    const TECLAS = {
        Tab: { windowsVirtualKeyCode: 9, code: 'Tab', key: 'Tab' },
        Enter: { windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter', text: '\r' },
        Espaco: { windowsVirtualKeyCode: 32, code: 'Space', key: ' ', text: ' ' },
        Escape: { windowsVirtualKeyCode: 27, code: 'Escape', key: 'Escape' },
    };
    async function tecla(nome, { shift = false } = {}) {
        const t = { ...TECLAS[nome], nativeVirtualKeyCode: TECLAS[nome].windowsVirtualKeyCode, modifiers: shift ? 8 : 0 };
        const { text, ...semTexto } = t;
        await enviar('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...t }, s);
        await enviar('Input.dispatchKeyEvent', { type: 'keyUp', ...semTexto }, s);
        await esperar(60);
    }
    async function clicar(x, y) {
        for (const type of ['mousePressed', 'mouseReleased']) {
            await enviar('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, s);
        }
        await esperar(120);
    }
    /** Nome acessível do elemento em foco, como o Chrome o dá a um leitor de ecrã. */
    async function nomeAcessivel(seletor) {
        const { root } = await enviar('DOM.getDocument', { depth: 0 }, s);
        const { nodeId } = await enviar('DOM.querySelector', { nodeId: root.nodeId, selector: seletor }, s);
        if (!nodeId) return null;
        const { nodes } = await enviar('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false }, s);
        return nodes?.[0]?.name?.value ?? null;
    }
    const foco = () => js(`const a = document.activeElement;
        return { tag: a?.tagName, id: a?.id || null, classe: a?.className?.baseVal ?? a?.className ?? null,
                 dentroDoDialogo: !!document.querySelector('dialog.modal-overlay')?.contains(a),
                 cartao: [...document.querySelectorAll('.apply-cta')].indexOf(a) };`);
    const dialogo = () => js(`const d = document.querySelector('dialog.modal-overlay');
        return d ? { aberto: d.open, modal: d.matches(':modal') } : null;`);

    await enviar('Page.navigate', { url: `${BASE}/careers` }, s);
    // Esperar pelo Angular: os botões existem no HTML pré-renderizado, mas só respondem
    // depois de a aplicação arrancar.
    for (let i = 0; i < 60; i++) {
        const pronto = await js(`return document.querySelectorAll('.apply-cta').length === 6 && !!document.querySelector('app-root')?.getAttribute('ng-version');`).catch(() => false);
        if (pronto) break;
        await esperar(250);
    }
    await esperar(1200); // animações de entrada dos cartões

    // ═══ 1. O teclado chega aos cartões ═════════════════════════════════════
    console.log('\n1. Tab até às vagas');
    await js(`document.activeElement?.blur(); window.scrollTo(0, 0); return true;`);
    let tabs = 0, f = await foco();
    while (f.cartao !== 0 && tabs < 80) { await tecla('Tab'); tabs++; f = await foco(); }
    certo(f.cartao === 0, `o Tab chega ao primeiro cartão (${tabs} Tabs desde o topo)`, f);
    certo(f.tag === 'BUTTON', 'e o que recebe o foco é um <button>', f.tag);
    const nome0 = await nomeAcessivel('.job-card:nth-child(1) .apply-cta');
    certo(nome0 === 'Candidatar-me: Encarregado de Tubagem', 'o nome acessível diz a vaga', nome0);
    const anel = await js(`const b = document.activeElement, st = getComputedStyle(b, '::after'), c = b.closest('.job-card');
        return { estilo: st.outlineStyle, largura: st.outlineWidth, posicao: st.position, elevado: getComputedStyle(c).transform !== 'none' };`);
    certo(anel.estilo === 'solid' && anel.largura === '3px' && anel.posicao === 'absolute', 'o anel de foco desenha-se no cartão inteiro (::after)', anel);
    await esperar(400);
    const elevado = await js(`return getComputedStyle(document.activeElement.closest('.job-card')).transform;`);
    certo(elevado !== 'none', 'o cartão em foco levanta como com o rato', elevado);
    const ordem = [];
    for (let i = 1; i < 6; i++) { await tecla('Tab'); ordem.push((await foco()).cartao); }
    certo(JSON.stringify(ordem) === '[1,2,3,4,5]', 'os seis cartões seguem-se um a um no Tab, sem paragens a mais', ordem);
    for (let i = 0; i < 5; i++) await tecla('Tab', { shift: true });
    certo((await foco()).cartao === 0, 'e o Shift+Tab volta ao primeiro');

    // ═══ 2. Enter abre, e o foco entra ══════════════════════════════════════
    console.log('\n2. Enter abre a candidatura');
    await tecla('Enter');
    await esperar(400);
    let d = await dialogo(); f = await foco();
    certo(d?.aberto && d?.modal, 'abre um <dialog> modal', d);
    certo(f.dentroDoDialogo, `o foco entra no diálogo (${f.tag}${f.classe ? '.' + f.classe : ''})`, f);
    const nomeDialogo = await nomeAcessivel('dialog.modal-overlay');
    certo(/Encarregado de Tubagem/.test(nomeDialogo || ''), `o diálogo tem nome: «${nomeDialogo}»`, nomeDialogo);
    const letras = await js(`const f = (q) => getComputedStyle(document.querySelector(q)).fontFamily;
        return { titulo: f('dialog .modal-title-job'), rotulo: f('dialog .form-group label') };`);
    certo(letras.titulo === letras.rotulo, 'o título do diálogo tem a mesma letra que o resto (o <h2> não herda a dos títulos)', letras);

    // ═══ 3. O Tab não sai ═══════════════════════════════════════════════════
    console.log('\n3. O foco fica preso no diálogo');
    const visitados = new Set(); let fora = [];
    for (let i = 0; i < 30; i++) {
        await tecla('Tab'); f = await foco();
        if (f.dentroDoDialogo) visitados.add(f.id || f.classe || f.tag);
        else if (f.tag !== 'BODY') fora.push(f);
    }
    for (let i = 0; i < 10; i++) { await tecla('Tab', { shift: true }); f = await foco(); if (!f.dentroDoDialogo && f.tag !== 'BODY') fora.push(f); }
    certo(fora.length === 0, '40 Tabs e Shift+Tabs, e nenhum sai para a página por trás', fora.slice(0, 3));
    for (const alvo of ['name', 'phone', 'email', 'candidatura-ficheiros', 'candidatura-consentimento']) {
        certo(visitados.has(alvo), `o Tab passa por #${alvo}`, [...visitados]);
    }
    certo([...visitados].some((v) => /btn-primary/.test(v)), 'o Tab passa pelo botão de enviar (já não está desativado)', [...visitados]);

    // ═══ 4. O campo de ficheiros ════════════════════════════════════════════
    console.log('\n4. CV pelo teclado');
    await js(`document.getElementById('candidatura-ficheiros').focus(); return true;`);
    await tecla('Tab', { shift: true }); await tecla('Tab'); // chegar-lhe com teclado, para o :focus-visible
    f = await foco();
    certo(f.id === 'candidatura-ficheiros', 'o campo de ficheiros recebe o foco', f);
    const zona = await js(`return getComputedStyle(document.querySelector('.drop-zone')).outlineStyle;`);
    certo(zona === 'solid', 'e a zona à volta mostra o anel de foco', zona);
    const nomeFicheiros = await nomeAcessivel('#candidatura-ficheiros');
    certo(/CV e certificados/.test(nomeFicheiros || ''), `o campo tem nome: «${nomeFicheiros}»`, nomeFicheiros);
    const pasta = mkdtempSync(join(tmpdir(), 'weldstaff-cv-'));
    const cv = join(pasta, 'CV Teste.pdf'); writeFileSync(cv, '%PDF-1.4 teste');
    const { root } = await enviar('DOM.getDocument', { depth: 0 }, s);
    const { nodeId } = await enviar('DOM.querySelector', { nodeId: root.nodeId, selector: '#candidatura-ficheiros' }, s);
    await enviar('DOM.setFileInputFiles', { files: [cv], nodeId }, s);
    await esperar(300);
    const linhas = await js(`return [...document.querySelectorAll('.file-item .file-name')].map((e) => e.textContent.trim());`);
    certo(JSON.stringify(linhas) === '["CV Teste.pdf"]', 'o ficheiro escolhido aparece na lista', linhas);
    await tecla('Tab'); f = await foco();
    const nomeRemover = await nomeAcessivel('.remove-file');
    certo(/remove-file/.test(f.classe || '') && nomeRemover === 'Remover CV Teste.pdf', `o × tem nome: «${nomeRemover}»`, { f, nomeRemover });
    await tecla('Enter');
    await esperar(200);
    f = await foco();
    const restam = await js(`return document.querySelectorAll('.file-item').length;`);
    certo(restam === 0 && f.id === 'candidatura-ficheiros', 'Enter no × remove-o, e o foco volta ao campo (não cai no body)', { restam, f });

    // ═══ 5. Enviar incompleto ═══════════════════════════════════════════════
    console.log('\n5. Enviar com o formulário incompleto');
    await js(`document.querySelector('dialog .btn-primary').focus(); return true;`);
    const desativado = await js(`return document.querySelector('dialog .btn-primary').disabled;`);
    certo(desativado === false, 'o botão de enviar não está desativado', desativado);
    certo(/btn-primary/.test((await foco()).classe || ''), 'e recebe o foco', await foco());
    await tecla('Enter');
    await esperar(250);
    f = await foco();
    const invalido = await js(`return document.getElementById('name').getAttribute('aria-invalid');`);
    certo(f.id === 'name' && invalido === 'true', 'o foco vai para o primeiro campo em falta, marcado como inválido', { f, invalido });
    d = await dialogo();
    certo(d?.aberto, 'e o diálogo continua aberto', d);
    // Enquanto envia, o botão fica aria-disabled; o rato por cima não o pode levantar.
    const centro = await js(`const b = document.querySelector('dialog .btn-primary'); b.setAttribute('aria-disabled', 'true');
        b.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 200));
        const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`);
    await enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: centro.x, y: centro.y }, s);
    await esperar(700);
    const aPairar = await js(`const b = document.querySelector('dialog .btn-primary');
        const r = { hover: b.matches(':hover'), transform: getComputedStyle(b).transform, brilho: getComputedStyle(b, '::after').left };
        b.removeAttribute('aria-disabled'); return r;`);
    certo(aPairar.hover && aPairar.transform === 'none', 'com aria-disabled, o rato por cima não levanta o botão', aPairar);
    await enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }, s);

    // ═══ 6. Escape fecha e o foco volta ═════════════════════════════════════
    console.log('\n6. Escape');
    await tecla('Escape');
    await esperar(400);
    d = await dialogo(); f = await foco();
    certo(d === null, 'Escape fecha o diálogo', d);
    certo(f.cartao === 0, 'e o foco volta ao cartão que o abriu', f);

    // ═══ 7. Espaço abre; o × fecha ══════════════════════════════════════════
    console.log('\n7. Espaço e o botão ×');
    await tecla('Tab'); await tecla('Tab');
    f = await foco();
    certo(f.cartao === 2, 'dois Tabs depois, está no terceiro cartão', f);
    await tecla('Espaco');
    await esperar(400);
    d = await dialogo();
    certo(d?.aberto, 'Espaço também abre', d);
    const titulo = await js(`return document.querySelector('.modal-title-job')?.textContent.trim();`);
    const esperado = await js(`return document.querySelectorAll('.job-title')[2].textContent.trim();`);
    certo(titulo === esperado, `e é a vaga certa («${titulo}»)`, { titulo, esperado });
    await js(`document.querySelector('dialog .close-btn').focus(); return true;`);
    await tecla('Enter');
    await esperar(400);
    d = await dialogo(); f = await foco();
    certo(d === null && f.cartao === 2, 'Enter no × fecha, e o foco volta ao terceiro cartão', { d, f });

    // ═══ 8. O rato continua a funcionar ═════════════════════════════════════
    console.log('\n8. Com o rato');
    const ponto = await js(`const p = document.querySelectorAll('.job-description')[0]; p.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 300)); const r = p.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        return { x, y, quem: document.elementFromPoint(x, y)?.className };`);
    certo(/apply-cta/.test(ponto.quem || ''), 'no meio da descrição, quem recebe o clique é o botão esticado', ponto);
    await clicar(ponto.x, ponto.y);
    await esperar(400);
    d = await dialogo();
    certo(d?.aberto, 'clicar na descrição do cartão abre a candidatura', d);
    await clicar(12, 12);
    await esperar(400);
    d = await dialogo();
    certo(d === null, 'clicar no véu, fora da caixa, fecha', d);

    // ═══ 9. O foco nunca fica tapado (WCAG 2.4.11) ══════════════════════════
    // No telemóvel, com o aviso de cookies aberto, ele ocupava 309 px de 700 e metade das
    // vagas recebia o foco completamente escondida atrás dele.
    console.log('\n9. O foco não fica debaixo do aviso de cookies nem do cabeçalho (telemóvel)');
    await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 1, mobile: true }, s);
    await enviar('Page.navigate', { url: `${BASE}/careers` }, s);
    for (let i = 0; i < 60; i++) {
        if (await js(`return !!document.querySelector('app-root')?.getAttribute('ng-version') && !!document.querySelector('.cookie-banner');`).catch(() => false)) break;
        await esperar(250);
    }
    await esperar(1200);
    const comAviso = await js(`return !!document.querySelector('.cookie-banner');`);
    certo(comAviso, 'o aviso de cookies está aberto (é o pior caso, o da primeira visita)', comAviso);
    const visivel = () => js(`const b = document.activeElement; if (!b?.classList.contains('apply-cta')) return null;
        const aviso = document.querySelector('.cookie-banner')?.getBoundingClientRect().top ?? innerHeight;
        const cab = document.querySelector('app-header header, header')?.getBoundingClientRect().bottom ?? 0;
        const pct = (r) => Math.round(100 * Math.max(0, Math.min(r.bottom, aviso) - Math.max(r.top, cab)) / r.height);
        // O que tem o foco é o botão; é ele que tem de estar inteiro à vista. O cartão (~370 px)
        // nem cabe nos 307 px que sobram entre o cabeçalho e o aviso num ecrã de 700.
        return { i: [...document.querySelectorAll('.apply-cta')].indexOf(b),
                 botao: pct(b.getBoundingClientRect()), cartao: pct(b.closest('.job-card').getBoundingClientRect()) };`);
    await js(`document.activeElement?.blur(); window.scrollTo(0, 0); return true;`);
    const aFrente = [];
    for (let i = 0; i < 90 && aFrente.length < 6; i++) { await tecla('Tab'); const v = await visivel(); if (v && !aFrente.some((x) => x.i === v.i)) aFrente.push(v); }
    certo(aFrente.length === 6 && aFrente.every((v) => v.botao === 100 && v.cartao >= 60), 'a andar para a frente, o botão em foco fica inteiro à vista acima do aviso (e o cartão quase todo)', aFrente);
    const aTras = [];
    for (let i = 0; i < 12 && aTras.length < 5; i++) { await tecla('Tab', { shift: true }); const v = await visivel(); if (v && !aTras.some((x) => x.i === v.i)) aTras.push(v); }
    certo(aTras.length === 5 && aTras.every((v) => v.botao === 100 && v.cartao >= 60), 'e a andar para trás, fica inteiro abaixo do cabeçalho', aTras);

    // ═══ 10. Ecrãs baixos: o foco no campo de ficheiros rola o sítio certo ════
    // O campo escondido posicionava-se no .modal-container (overflow: hidden): ao receber o
    // foco num ecrã baixo, o browser rolava o contentor, o cabeçalho e o × saíam por cima e a
    // zona ficava fora da vista.
    console.log('\n10. Ecrãs baixos: Tab até ao CV sem esconder o cabeçalho');
    for (const [w, h] of [[390, 420], [740, 360]]) {
        await enviar('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true }, s);
        await enviar('Page.navigate', { url: `${BASE}/careers` }, s);
        for (let i = 0; i < 60; i++) {
            if (await js(`return !!document.querySelector('app-root')?.getAttribute('ng-version') && document.querySelectorAll('.apply-cta').length === 6;`).catch(() => false)) break;
            await esperar(250);
        }
        await esperar(1000);
        await js(`document.querySelector('.apply-cta').focus(); return true;`);
        await tecla('Enter'); await esperar(400);
        for (let i = 0; i < 15 && (await foco()).id !== 'candidatura-ficheiros'; i++) await tecla('Tab');
        await esperar(250);
        const m = await js(`const c = document.querySelector('dialog .modal-container'), b = c.querySelector('.modal-body');
            const rc = c.getBoundingClientRect(), rh = c.querySelector('.modal-header').getBoundingClientRect();
            const rz = c.querySelector('.drop-zone').getBoundingClientRect(), rb = b.getBoundingClientRect();
            return { foco: document.activeElement.id, contentor: c.scrollTop, corpo: Math.round(b.scrollTop),
                     cabecalho: rh.top >= rc.top - 1, zona: rz.top >= rb.top - 1 && rz.bottom <= rb.bottom + 1 };`);
        certo(m.foco === 'candidatura-ficheiros' && m.contentor === 0 && m.cabecalho,
            `${w}×${h}: o cabeçalho e o × continuam à vista (a caixa do diálogo não rolou)`, m);
        certo(m.corpo > 0 && m.zona, `${w}×${h}: quem rola é o corpo do formulário, e a zona do CV fica à vista`, m);
        await tecla('Escape'); await esperar(300);
    }

    // ═══ 11. O Turnstile nunca responde: a candidatura não fica presa ═════════
    // Uma extensão que bloqueia o Turnstile (ou um desafio que precisa de um clique, no
    // contentor escondido) deixava o botão em «A enviar…» para sempre. O Worker fica
    // bloqueado também: este caso nunca pode enviar uma candidatura a sério.
    console.log('\n11. Turnstile bloqueado: ao fim de 20 s a candidatura avisa e liberta o botão');
    await enviar('Network.enable', {}, s);
    await enviar('Network.setBlockedURLs', { urls: ['*challenges.cloudflare.com*', '*weld-staff-api*'] }, s);
    const pedidosAoWorker = [];
    enviar.ouvintes.add((m) => { if (m.sessionId === s && m.method === 'Network.requestWillBeSent' && /weld-staff-api/.test(m.params.request.url)) pedidosAoWorker.push(m.params.request.url); });
    await enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, s);
    await enviar('Page.navigate', { url: `${BASE}/careers` }, s);
    for (let i = 0; i < 60; i++) {
        if (await js(`return !!document.querySelector('app-root')?.getAttribute('ng-version') && document.querySelectorAll('.apply-cta').length === 6;`).catch(() => false)) break;
        await esperar(250);
    }
    await esperar(1000);
    await js(`window.__alertas = []; window.alert = (m) => window.__alertas.push(String(m)); document.querySelector('.apply-cta').focus(); return true;`);
    await tecla('Enter'); await esperar(400);
    for (const [id, texto] of [['name', 'Teste Teclado'], ['phone', '912345678'], ['email', 'teste@exemplo.pt']]) {
        await js(`document.querySelector('dialog #${id}').focus(); return true;`);
        await enviar('Input.insertText', { text: texto }, s); await esperar(60);
    }
    await js(`document.querySelector('dialog #candidatura-consentimento').focus(); return true;`);
    await tecla('Espaco');
    const marcado = await js(`return document.querySelector('dialog #candidatura-consentimento').checked;`);
    certo(marcado, 'o consentimento marca-se com Espaço', marcado);
    await js(`document.querySelector('dialog .btn-primary').focus(); return true;`);
    await tecla('Enter'); await esperar(300);
    const aEnviar = await js(`return document.querySelector('dialog .btn-primary').getAttribute('aria-disabled');`);
    certo(aEnviar === 'true', 'com o formulário completo, o envio começa (botão aria-disabled)', aEnviar);
    let alertas = [];
    for (let i = 0; i < 30 && !alertas.length; i++) { await esperar(1000); alertas = await js(`return window.__alertas;`); }
    const botao = await js(`return document.querySelector('dialog .btn-primary')?.getAttribute('aria-disabled');`);
    certo(alertas.length === 1 && /erro ao enviar/.test(alertas[0]), `ao fim de ~20 s aparece o aviso de erro («${(alertas[0] || '').slice(0, 45)}…»)`, alertas);
    certo(botao === null, 'e o botão volta a estar disponível, para tentar outra vez', botao);
    certo(pedidosAoWorker.length === 0, 'e nada chegou ao Worker (sem token, nada se envia)', pedidosAoWorker);
    await enviar('Network.setBlockedURLs', { urls: [] }, s);

    // ═══ 12–14. A caixa do Turnstile só aparece quando a Cloudflare pede um clique ═══
    // Com as chaves de teste da Cloudflare (valem em qualquer domínio), trocadas só neste
    // Chrome: 3x…FF força o desafio interactivo, 1x…AA passa sem interação. Eu não marco a
    // caixa (é um anti-robô): prova-se que ela aparece e que o formulário espera. O Worker
    // fica bloqueado — nada chega a ser enviado.
    // Nada de definir window.turnstile de antemão: o script do Turnstile vê que já existe e
    // não carrega. Espera-se que ele apareça e embrulha-se o render (é gravável).
    const trocarChave = (chave) => enviar('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
        const t = setInterval(() => { const ts = window.turnstile;
          if (ts && typeof ts.render === 'function' && !ts.__trocado) { const r = ts.render.bind(ts);
            ts.render = (el, o) => r(el, { ...o, sitekey: '${chave}' }); ts.__trocado = true; clearInterval(t); } }, 5);
        window.__alertas = []; window.alert = (m) => window.__alertas.push(String(m)); })();` }, s);
    const pedidosAoWorker2 = [];
    enviar.ouvintes.add((m) => { if (m.sessionId === s && m.method === 'Network.requestWillBeSent' && /weld-staff-api/.test(m.params.request.url)) pedidosAoWorker2.push(m.params.request.url); });
    await enviar('Network.setBlockedURLs', { urls: ['*weld-staff-api*'] }, s);
    const alturaDoWidget = (onde) => js(`const t = document.querySelector('${onde} app-turnstile'); return t ? { altura: t.getBoundingClientRect().height, classe: t.classList.contains('a-pedir-interacao') } : null;`);
    async function candidaturaPreenchida() {
        await enviar('Page.navigate', { url: `${BASE}/careers` }, s);
        for (let i = 0; i < 60; i++) {
            if (await js(`return !!document.querySelector('app-root')?.getAttribute('ng-version') && document.querySelectorAll('.apply-cta').length === 6;`).catch(() => false)) break;
            await esperar(250);
        }
        await esperar(800);
        await js(`document.querySelector('.apply-cta').focus(); return true;`);
        await tecla('Enter'); await esperar(400);
        for (const [id, texto] of [['name', 'Teste Teclado'], ['phone', '912345678'], ['email', 'teste@exemplo.pt']]) {
            await js(`document.querySelector('dialog #${id}').focus(); return true;`);
            await enviar('Input.insertText', { text: texto }, s); await esperar(60);
        }
        await js(`document.querySelector('dialog #candidatura-consentimento').focus(); return true;`);
        await tecla('Espaco');
        await js(`document.querySelector('dialog .btn-primary').focus(); return true;`);
    }

    console.log('\n12. A Cloudflare pede um clique: a caixa aparece na candidatura e o formulário espera');
    let ident = (await trocarChave('3x00000000000000000000FF')).identifier;
    await candidaturaPreenchida();
    const antes = await alturaDoWidget('dialog');
    certo(antes && antes.altura === 0, 'antes de enviar, o widget não ocupa espaço nenhum', antes);
    await tecla('Enter');
    let widget = null;
    for (let i = 0; i < 20; i++) { await esperar(500); widget = await alturaDoWidget('dialog'); if (widget?.altura > 0) break; }
    certo(widget?.altura > 40 && widget.classe, `ao enviar, a caixa aparece dentro da candidatura (${Math.round(widget?.altura || 0)} px)`, widget);
    await esperar(25000);
    const estado12 = await js(`return { alertas: window.__alertas, botao: document.querySelector('dialog .btn-primary')?.getAttribute('aria-disabled'), aberto: !!document.querySelector('dialog.modal-overlay[open]') };`);
    certo(estado12.alertas.length === 0 && estado12.botao === 'true' && estado12.aberto,
        'passados 25 s não há erro: com a caixa à vista, a guarda de 20 s está parada à espera da pessoa', estado12);
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier: ident }, s);

    console.log('\n13. A Cloudflare não pede nada: o widget fica com 0 px e o envio segue');
    ident = (await trocarChave('1x00000000000000000000AA')).identifier;
    pedidosAoWorker2.length = 0;
    await candidaturaPreenchida();
    await tecla('Enter');
    const alturas = [];
    for (let i = 0; i < 16 && !pedidosAoWorker2.length; i++) { await esperar(500); alturas.push((await alturaDoWidget('dialog'))?.altura); }
    certo(pedidosAoWorker2.length === 1, 'o token chega e a candidatura segue para o Worker (bloqueado neste teste)', pedidosAoWorker2);
    certo(alturas.length > 0 && alturas.every((a) => a === 0), 'e o widget nunca ocupou espaço — o formulário não mexeu', alturas);
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier: ident }, s);

    console.log('\n14. O mesmo no formulário de contacto');
    ident = (await trocarChave('3x00000000000000000000FF')).identifier;
    await enviar('Page.navigate', { url: `${BASE}/contactos` }, s);
    for (let i = 0; i < 60; i++) {
        if (await js(`return !!document.querySelector('app-root')?.getAttribute('ng-version') && !!document.querySelector('form app-turnstile');`).catch(() => false)) break;
        await esperar(250);
    }
    await esperar(800);
    const campos = await js(`return [...document.querySelectorAll('form input, form textarea')].map((e) => e.getAttribute('formcontrolname') || e.id || e.type);`);
    for (const [controlo, texto] of [['name', 'Teste Teclado'], ['email', 'teste@exemplo.pt'], ['phone', '912345678'], ['message', 'Mensagem de teste com mais de vinte caracteres.']]) {
        await js(`document.querySelector('form [formcontrolname="${controlo}"]').focus(); return true;`);
        await enviar('Input.insertText', { text: texto }, s); await esperar(60);
    }
    await js(`document.querySelector('form [formcontrolname="consent"]').focus(); return true;`);
    await tecla('Espaco');
    await js(`document.querySelector('form [type="submit"]').focus(); return true;`);
    await tecla('Enter');
    let widgetC = null;
    for (let i = 0; i < 20; i++) { await esperar(500); widgetC = await alturaDoWidget('form'); if (widgetC?.altura > 0) break; }
    certo(widgetC?.altura > 40 && widgetC.classe, `no contacto, a caixa aparece no formulário (${Math.round(widgetC?.altura || 0)} px)`, { widgetC, campos });
    await esperar(25000);
    const erroC = await js(`return document.querySelector('.alert.alert-error')?.innerText?.trim() || null;`);
    certo(erroC === null, 'e passados 25 s não aparece a mensagem de erro (.alert-error)', erroC);
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier: ident }, s);
    await enviar('Network.setBlockedURLs', { urls: [] }, s);

    // ═══ 15. Cada língua tem a sua morada ═══════════════════════════════════
    // Antes a língua mudava só no browser e o Google só conhecia o português. Agora
    // /en/careers é uma página: o seletor leva à mesma página na outra língua, as ligações
    // ficam na língua, e quem ESCOLHEU uma língua (e autorizou guardá-la) volta a ela.
    console.log('\n15. Cada língua tem a sua morada');
    const errosNaConsola = [];
    const ouvirConsola = (m) => { if (m.sessionId === s && m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errosNaConsola.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200)); };
    enviar.ouvintes.add(ouvirConsola);
    // O Worker e o Turnstile ficam de fora: nada aqui envia, e o /contactos tem o widget.
    await enviar('Network.setBlockedURLs', { urls: ['*weld-staff-api*', '*challenges.cloudflare.com*'] }, s);
    await enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, s);
    const abrir = async (caminho, condicao = 'true') => {
        await enviar('Page.navigate', { url: `${BASE}${caminho}` }, s);
        for (let i = 0; i < 60; i++) {
            if (await js(`return !!document.querySelector('app-root')?.getAttribute('ng-version') && (${condicao});`).catch(() => false)) break;
            await esperar(250);
        }
        await esperar(700);
    };
    const pagina = () => js(`const q = (x) => document.querySelector(x), txt = (e) => e?.textContent.replace(/\\s+/g, ' ').trim() ?? null;
        return { caminho: location.pathname, lang: document.documentElement.lang, h1: txt(q('h1')), titulo: document.title,
                 canonica: q('link[rel=canonical]')?.getAttribute('href'),
                 alternativas: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map((l) => l.hreflang + ' ' + new URL(l.href).pathname),
                 ligacoes: [...document.querySelectorAll('app-header a[href^="/"], app-footer a[href^="/"]')].map((a) => a.getAttribute('href')) };`);
    // Em português ('') nenhuma ligação pode ter prefixo; nas outras, todas o têm.
    const naLingua = (ligacoes, prefixo) => ligacoes.length >= 8 && ligacoes.every((h) =>
        prefixo ? h === prefixo || h.startsWith(prefixo + '/') : !/^\/(en|fr|es)(\/|$)/.test(h));
    const guardada = () => js(`return localStorage.getItem('lang');`);
    async function escolherLingua(nome) {
        await js(`document.querySelector('.lang-btn').focus(); return true;`);
        await tecla('Enter'); await esperar(200);
        let chegou = false;
        for (let i = 0; i < 6 && !chegou; i++) {
            await tecla('Tab');
            chegou = await js(`const a = document.activeElement; return !!a?.closest('.lang-dropdown') && a.textContent.includes(${JSON.stringify(nome)});`);
        }
        if (chegou) await tecla('Enter');
        return chegou;
    }
    const esperarCaminho = async (caminho) => {
        for (let i = 0; i < 50 && (await js(`return location.pathname;`)) !== caminho; i++) await esperar(100);
        await esperar(700);
    };

    // Começa do zero: sem consentimento e sem língua guardada.
    await abrir('/en/careers');
    await js(`localStorage.clear(); return true;`);
    // As traduções chegam 600 ms atrasadas: o que pintar antes da língua certa, vê-se.
    atrasoDasTraducoes = 600;
    const vigia = (await enviar('Page.addScriptToEvaluateOnNewDocument', { source: `window.__textos = []; (() => { const t0 = performance.now();
        const passo = () => { const t = (q) => document.querySelector(q)?.textContent.replace(/\\s+/g, ' ').trim() ?? null;
            const l = JSON.stringify([t('app-header nav a[href$="careers"]'), t('app-footer h4'), t('h1')]);
            if (window.__textos.at(-1) !== l) window.__textos.push(l);
            if (performance.now() - t0 < 3000) requestAnimationFrame(passo); };
        document.addEventListener('DOMContentLoaded', passo); })();` }, s)).identifier;
    await abrir('/en/careers', `document.querySelectorAll('.apply-cta').length === 6`);
    await esperar(2500);
    const textos = await js(`return window.__textos;`);
    await enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier: vigia }, s);
    atrasoDasTraducoes = 0;
    certo(textos.length === 1 && JSON.parse(textos[0]).every((x) => x && !/Carreiras|Links Rápidos/.test(x)),
        'com as traduções atrasadas, o menu e o rodapé nunca ficam em branco nem passam pelo português', textos);

    let p = await pagina();
    certo(p.lang === 'en' && p.h1 === 'Careers' && p.titulo === 'Careers - Join WeldStaff', '/en/careers abre em inglês: lang, título e h1', p);
    certo(p.canonica === 'https://weldstaff.pt/en/careers', 'o canónico é a morada inglesa', p.canonica);
    certo(JSON.stringify(p.alternativas) === JSON.stringify(['pt-PT /careers', 'en /en/careers', 'fr /fr/careers', 'es /es/careers', 'x-default /careers']),
        'as alternativas dão as quatro línguas, e o português por omissão', p.alternativas);
    certo(naLingua(p.ligacoes, '/en'), `as ${p.ligacoes.length} ligações do cabeçalho e do rodapé ficam em /en`, p.ligacoes);
    const nomeEn = await nomeAcessivel('.job-card:nth-child(1) .apply-cta');
    certo(nomeEn === 'Apply Now: Piping Foreman', `o cartão diz a vaga em inglês a um leitor de ecrã («${nomeEn}»)`, nomeEn);

    // O seletor, só com o teclado. Ainda sem consentimento: a escolha vale, mas não se grava.
    let chegou = await escolherLingua('Français');
    await esperarCaminho('/fr/careers');
    p = await pagina();
    certo(chegou && p.caminho === '/fr/careers' && p.lang === 'fr' && p.h1 === 'Carrières',
        'o seletor abre com Enter, o Tab chega a «Français» e o Enter leva a /fr/careers', { chegou, ...p });
    certo(p.titulo === 'Carrières - Rejoignez WeldStaff' && p.canonica === 'https://weldstaff.pt/fr/careers',
        'o título e o canónico passam ao francês (não fica o título português da rota)', { titulo: p.titulo, canonica: p.canonica });
    certo(naLingua(p.ligacoes, '/fr'), 'as ligações passam a /fr', p.ligacoes);
    certo(await guardada() === null, 'sem consentimento, a escolha não fica gravada', await guardada());

    // Aceitar os cookies depois de escolher grava a escolha (categoria «Funcionais»).
    await js(`document.querySelector('.cookie-actions .cookie-btn-accept').focus(); return true;`);
    await tecla('Enter'); await esperar(300);
    certo(await guardada() === 'fr', 'ao aceitar os cookies, a língua escolhida fica gravada', await guardada());

    // Voltar ao português não pode ser desfeito pela preferência gravada.
    chegou = await escolherLingua('Português');
    await esperarCaminho('/careers');
    await esperar(800);
    p = await pagina();
    certo(chegou && p.caminho === '/careers' && p.lang === 'pt-PT' && p.h1 === 'Carreiras',
        'escolher «Português» leva a /careers e fica lá (a preferência gravada não o devolve ao francês)', { chegou, ...p });
    certo(await guardada() === 'pt-PT' && naLingua(p.ligacoes, ''), 'a preferência passa a português, e as ligações perdem o prefixo', { guardada: await guardada(), ligacoes: p.ligacoes });

    // O «Voltar» depois de mudar de língua regressa à página de antes, na língua de antes:
    // a preferência só decide a primeira página de uma visita, não o histórico.
    chegou = await escolherLingua('Español');
    await esperarCaminho('/es/careers');
    await js(`history.back(); return true;`);
    await esperar(1500);
    p = await pagina();
    certo(chegou && p.caminho === '/careers' && p.lang === 'pt-PT' && await guardada() === 'es',
        'escolher «Español» e carregar em Voltar regressa a /careers em português (a escolha fica gravada)', { chegou, ...p, guardada: await guardada() });

    // Noutra visita: quem escolheu espanhol e abre uma morada portuguesa volta ao espanhol…
    await js(`localStorage.setItem('lang', 'es'); return true;`);
    await abrir('/contactos', `location.pathname === '/es/contactos'`);
    p = await pagina();
    certo(p.caminho === '/es/contactos' && p.lang === 'es' && p.h1 === 'Contacto', 'quem escolheu espanhol e abre /contactos numa visita nova vai para /es/contactos', p);
    const historico = await enviar('Page.getNavigationHistory', {}, s);
    const anterior = historico.entries[historico.currentIndex - 1]?.url ?? '';
    certo(!/\/contactos$/.test(anterior), 'e a morada portuguesa sai do histórico: o Voltar leva à página de onde se veio', { anterior, atual: historico.entries[historico.currentIndex]?.url });
    // …mas uma morada com língua é respeitada, e não lhe muda a preferência.
    await abrir('/en/termos');
    p = await pagina();
    certo(p.caminho === '/en/termos' && p.lang === 'en' && await guardada() === 'es',
        'uma ligação para /en/termos abre em inglês e não apaga a escolha do espanhol', { ...p, guardada: await guardada() });

    // O 404 na língua da morada.
    await abrir('/en/naoexiste', `!!document.querySelector('app-not-found')`);
    const nf = await js(`const a = document.querySelector('app-not-found a');
        return { lang: document.documentElement.lang, h2: document.querySelector('app-not-found h2')?.textContent.trim(),
                 titulo: document.title, voltar: a?.getAttribute('href'), texto: a?.textContent.trim() };`);
    certo(nf.lang === 'en' && nf.h2 === 'Page Not Found' && nf.titulo === 'Page Not Found - WeldStaff', 'uma morada inglesa que não existe dá o 404 em inglês', nf);
    certo(nf.voltar === '/en' && nf.texto === 'Back to Home', '«Back to Home» leva à página inicial inglesa, e não à portuguesa', nf);

    // A página inicial inglesa tem a barra transparente da portuguesa, e a transição anima.
    await abrir('/en');
    const barra = await js(`window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300)); return document.querySelector('app-header header').className;`);
    certo(!/\bscrolled\b/.test(barra), 'em /en, no topo, a barra é transparente como em /', barra);
    await js(`window.__vistos = []; const t0 = performance.now(); (function passo() {
        window.__vistos.push([...document.querySelector('main').children].filter((e) => e.tagName !== 'ROUTER-OUTLET').map((e) => e.tagName.toLowerCase()).join('+'));
        if (performance.now() - t0 < 2000) requestAnimationFrame(passo); })(); return true;`);
    const alvo = await js(`const a = [...document.querySelectorAll('app-header a[href="/en/careers"]')].find((e) => e.getBoundingClientRect().width > 0);
        const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
    await clicar(alvo.x, alvo.y);
    await esperar(2300);
    const vistos = [...new Set(await js(`return window.__vistos;`))];
    const onde = await js(`return location.pathname;`);
    certo(onde === '/en/careers' && vistos.some((v) => v.includes('+')), 'clicar em «Careers» leva a /en/careers com a transição animada (as duas páginas cruzam-se)', { onde, vistos });

    // Uma navegação que reaproveita a página (de /en/careers?utm_source=… para /en/careers) não
    // a volta a criar, e o título tem de sobreviver: o Angular repunha o título português da rota.
    await abrir('/en/careers?utm_source=teste', `document.querySelectorAll('.apply-cta').length === 6`);
    const alvo2 = await js(`const a = [...document.querySelectorAll('app-header a[href="/en/careers"]')].find((e) => e.getBoundingClientRect().width > 0);
        const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
    await clicar(alvo2.x, alvo2.y);
    await esperar(1200);
    const reaproveitada = await js(`return { morada: location.pathname + location.search, titulo: document.title };`);
    certo(reaproveitada.morada === '/en/careers' && reaproveitada.titulo === 'Careers - Join WeldStaff',
        'vindo de /en/careers?utm_source=…, clicar em «Careers» deixa o título em inglês', reaproveitada);

    certo(errosNaConsola.length === 0, 'nenhum erro na consola em toda a secção (hidratação incluída)', errosNaConsola);
    enviar.ouvintes.delete(ouvirConsola);
    await js(`localStorage.clear(); return true;`);
    await enviar('Network.setBlockedURLs', { urls: [] }, s);

    console.log('\n16. Sem erros');
    certo(excecoes.length === 0, 'nenhuma excepção por apanhar em toda a corrida', excecoes);
} catch (erro) {
    falhas++; console.error('\nA bateria rebentou:', erro);
} finally {
    fechar(); servidor.close();
}
console.log(`\n${certas} certas, ${falhas} falhadas`);
process.exit(falhas ? 1 : 0);
