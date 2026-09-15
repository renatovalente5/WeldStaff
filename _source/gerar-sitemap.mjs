#!/usr/bin/env node
// Gera o src/sitemap.xml a partir da lista de rotas.
//
// O <lastmod> não é a data de hoje nem a data do build: é a data do último commit
// que tocou no que dá origem àquela página. Um sitemap que diz «mudou hoje» a cada
// publicação deixa de ser levado a sério; um que ficou preso em abril (era o caso)
// diz aos motores que não vale a pena voltar.
//
// Corre sozinho antes do `ng build` (ver "prebuild" no package.json).

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://weldstaff.pt';
const DESTINO = resolve(RAIZ, 'src/sitemap.xml');

// O que entra em TODAS as páginas: cabeçalho, rodapé, componentes partilhados,
// o shell do index.html e as traduções (o HTML pré-renderizado leva-as lá dentro).
const PARTILHADO = [
  'src/app/core/header',
  'src/app/core/footer',
  'src/app/shared',
  'src/app/app.ts',
  'src/app/app.html',
  'src/index.html',
  'src/assets/i18n',
];

// A ordem aqui é a ordem do sitemap. O caminho é o mesmo que está nos canonicals:
// sem barra final. As duas formas respondem 200 (ver o workflow), mas só uma é a canónica.
const ROTAS = [
  { caminho: '/', fontes: ['src/app/pages/home'] },
  { caminho: '/contactos', fontes: ['src/app/pages/contact'] },
  { caminho: '/careers', fontes: ['src/app/pages/careers', 'src/app/core/services/career.ts'] },
  { caminho: '/privacidade', fontes: ['src/app/pages/privacy'] },
  { caminho: '/cookies', fontes: ['src/app/pages/cookies'] },
  { caminho: '/termos', fontes: ['src/app/pages/terms'] },
];

/** Data (YYYY-MM-DD) do último commit que tocou no caminho, ou null. */
function dataDoUltimoCommit(caminho) {
  if (!existsSync(resolve(RAIZ, caminho))) return null;
  try {
    const saida = execFileSync(
      'git',
      ['log', '-1', '--format=%cs', '--', caminho],
      { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(saida) ? saida : null;
  } catch {
    return null;
  }
}

/** Os <lastmod> que já estão publicados, para não os perder se o git não responder. */
function lastmodExistentes() {
  if (!existsSync(DESTINO)) return {};
  const xml = readFileSync(DESTINO, 'utf8');
  const mapa = {};
  for (const bloco of xml.split('<url>').slice(1)) {
    const loc = bloco.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const lastmod = bloco.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    if (loc && lastmod) mapa[loc] = lastmod;
  }
  return mapa;
}

const anteriores = lastmodExistentes();
const datasPartilhadas = PARTILHADO.map(dataDoUltimoCommit).filter(Boolean);

// Uma clonagem rasa (fetch-depth: 1) devolve a data do único commit que existe para
// tudo — seis páginas com a mesma data seria mentira. O workflow usa fetch-depth: 0;
// se ainda assim não houver histórico, mantém-se o que já estava publicado.
const semHistorico = datasPartilhadas.length === 0;

const urls = ROTAS.map(({ caminho, fontes }) => {
  const loc = SITE + caminho;
  const datas = [...fontes.map(dataDoUltimoCommit).filter(Boolean), ...datasPartilhadas];
  const lastmod = datas.length ? datas.sort().at(-1) : anteriores[loc];
  return { loc, lastmod };
});

if (semHistorico) {
  console.warn('gerar-sitemap: sem histórico do git — mantidos os lastmod anteriores.');
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(({ loc, lastmod }) =>
    [
      '    <url>',
      `        <loc>${loc}</loc>`,
      ...(lastmod ? [`        <lastmod>${lastmod}</lastmod>`] : []),
      '    </url>',
    ].join('\n'),
  ),
  '</urlset>',
  '',
].join('\n');

writeFileSync(DESTINO, xml);
console.log(`gerar-sitemap: ${urls.length} URLs escritos em src/sitemap.xml`);
for (const { loc, lastmod } of urls) console.log(`  ${lastmod ?? '(sem data)'}  ${loc}`);
