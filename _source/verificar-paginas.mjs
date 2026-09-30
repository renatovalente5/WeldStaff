#!/usr/bin/env node
// Confirma, página a página, que o HTML pré-renderizado diz o mesmo que o sitemap: a língua
// do <html lang>, o canónico, o og:url, o og:locale e as alternativas (hreflang).
//
// Um hreflang que aponta para a página errada, ou que só existe de um dos lados, não parte
// nada à vista: o Google ignora-o em silêncio e o Search Console só o diz semanas depois.
//
//   npm run build && node _source/verificar-paginas.mjs
//
// Corre no workflow depois do build; sai com 1 à primeira divergência.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = resolve(RAIZ, 'dist/weld-staff/browser');
const SITE = 'https://weldstaff.pt';
const LOCALES = { 'pt-PT': 'pt_PT', en: 'en_GB', fr: 'fr_FR', es: 'es_ES' };

/** Os atributos de cada <tag …> do tipo pedido, por qualquer ordem. */
function etiquetas(html, nome) {
  return [...html.matchAll(new RegExp(`<${nome}\\b([^>]*)>`, 'gi'))].map(([, atributos]) =>
    Object.fromEntries([...atributos.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k.toLowerCase(), v])),
  );
}

const alternativasEmTexto = (lista) => lista.map(({ hreflang, href }) => `${hreflang} ${href}`).sort().join('\n');

const sitemap = readFileSync(join(SAIDA, 'sitemap.xml'), 'utf8');
const urls = sitemap.split('<url>').slice(1).map((bloco) => ({
  loc: bloco.match(/<loc>([^<]+)<\/loc>/)?.[1],
  alternativas: etiquetas(bloco, 'xhtml:link').map(({ hreflang, href }) => ({ hreflang, href })),
}));

const erros = [];
for (const { loc, alternativas } of urls) {
  const caminho = loc.slice(SITE.length);
  const ficheiro = join(SAIDA, caminho === '/' ? 'index.html' : `${caminho.slice(1)}/index.html`);
  if (!existsSync(ficheiro)) { erros.push(`${loc}: falta ${ficheiro}`); continue; }
  const html = readFileSync(ficheiro, 'utf8');
  const falha = (texto) => erros.push(`${loc}: ${texto}`);

  // A língua desta morada é a da alternativa que aponta para ela própria.
  const propria = alternativas.filter((a) => a.href === loc && a.hreflang !== 'x-default');
  if (propria.length !== 1) { falha(`o sitemap não lhe dá uma língua (${propria.length} alternativas para si)`); continue; }
  const lingua = propria[0].hreflang;

  const lang = html.match(/<html\b[^>]*\blang="([^"]+)"/i)?.[1];
  if (lang !== lingua) falha(`<html lang="${lang}"> e o sitemap diz ${lingua}`);

  const links = etiquetas(html, 'link');
  const metas = etiquetas(html, 'meta');
  const canonicas = links.filter((l) => l.rel === 'canonical').map((l) => l.href);
  if (canonicas.length !== 1 || canonicas[0] !== loc) falha(`canónico ${JSON.stringify(canonicas)}`);

  const ogUrl = metas.find((m) => m.property === 'og:url')?.content;
  if (ogUrl !== loc) falha(`og:url ${ogUrl}`);
  const ogLocale = metas.find((m) => m.property === 'og:locale')?.content;
  if (ogLocale !== LOCALES[lingua]) falha(`og:locale ${ogLocale}, esperado ${LOCALES[lingua]}`);

  const naPagina = links.filter((l) => l.rel === 'alternate' && l.hreflang).map(({ hreflang, href }) => ({ hreflang, href }));
  if (alternativasEmTexto(naPagina) !== alternativasEmTexto(alternativas)) {
    falha(`as alternativas da página não são as do sitemap:\n    página:  ${alternativasEmTexto(naPagina).replaceAll('\n', ' | ')}\n    sitemap: ${alternativasEmTexto(alternativas).replaceAll('\n', ' | ')}`);
  }

  // Todas as alternativas apontam para páginas que existem neste build.
  for (const { href } of alternativas) {
    if (!urls.some((u) => u.loc === href)) falha(`alternativa ${href} não está no sitemap`);
  }
}

if (erros.length) {
  for (const e of erros) console.log(`::error::${e}`);
  process.exit(1);
}
console.log(`verificar-paginas: ${urls.length} páginas; língua, canónico, og:url, og:locale e alternativas batem com o sitemap`);
