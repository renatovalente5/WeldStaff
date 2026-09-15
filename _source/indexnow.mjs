#!/usr/bin/env node
// IndexNow: avisa o Bing (e o Yandex, o Seznam, o Naver — partilham a mesma rede) de
// que uma página mudou, em vez de esperar que voltem a passar por ela. O Google não
// participa; para ele valem o sitemap e o Search Console.
//
// A chave é pública por desenho: vive em public/<chave>.txt e é assim que o Bing
// confirma que quem submete manda no domínio. Não é um segredo.
//
//   node _source/indexnow.mjs payload   → escreve o JSON a submeter, ou nada
//
// Só entram as páginas cujo <lastmod> mudou face ao sitemap que ESTÁ NO AR neste
// momento. Submeter as seis a cada publicação seria ruído, e o Bing conta-o.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'weldstaff.pt';
const CHAVE = 'f363101b1f43316221e322a2e3089d45';
const SITEMAP_NO_AR = `https://${HOST}/sitemap.xml`;

function lerSitemap(xml) {
  const mapa = new Map();
  for (const bloco of xml.split('<url>').slice(1)) {
    const loc = bloco.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (loc) mapa.set(loc, bloco.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '');
  }
  return mapa;
}

async function sitemapNoAr() {
  try {
    const resposta = await fetch(SITEMAP_NO_AR, { signal: AbortSignal.timeout(15000) });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return lerSitemap(await resposta.text());
  } catch (erro) {
    console.error(`indexnow: não foi possível ler o sitemap no ar (${erro.message}).`);
    return null;
  }
}

const novo = lerSitemap(readFileSync(resolve(RAIZ, 'src/sitemap.xml'), 'utf8'));
const antigo = await sitemapNoAr();

// Sem o sitemap antigo não há como saber o que mudou. Nesse caso não se submete nada:
// é melhor perder uma notificação do que submeter seis URLs iguais a cada publicação.
if (antigo === null) process.exit(0);

const alterados = [...novo]
  .filter(([loc, lastmod]) => antigo.get(loc) !== lastmod)
  .map(([loc]) => loc);

if (alterados.length === 0) {
  console.error('indexnow: nada mudou; não há nada a submeter.');
  process.exit(0);
}

console.error(`indexnow: ${alterados.length} URL(s) a submeter:`);
for (const url of alterados) console.error(`  ${url}`);

process.stdout.write(
  JSON.stringify({
    host: HOST,
    key: CHAVE,
    keyLocation: `https://${HOST}/${CHAVE}.txt`,
    urlList: alterados,
  }),
);
