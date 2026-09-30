// Bateria de teclado das candidaturas (/careers): conduz um Chrome sem interface com
// teclas VERDADEIRAS pelo protocolo de depuração — Tab, Enter, Espaço e Escape com o
// keyCode certo. Um .click() de JavaScript ou uma tecla sem keyCode passam onde uma
// pessoa não passa; isto não.
//
//   npm run build && node _dev/bateria-teclado.mjs
//
// Serve o dist/ numa porta sorteada. Não envia candidatura nenhuma.

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
const servidor = createServer((req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = join(RAIZ, caminho);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) f = join(RAIZ, 'index.csr.html');
    res.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
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

    console.log('\n12. Sem erros');
    certo(excecoes.length === 0, 'nenhuma excepção por apanhar em toda a corrida', excecoes);
} catch (erro) {
    falhas++; console.error('\nA bateria rebentou:', erro);
} finally {
    fechar(); servidor.close();
}
console.log(`\n${certas} certas, ${falhas} falhadas`);
process.exit(falhas ? 1 : 0);
