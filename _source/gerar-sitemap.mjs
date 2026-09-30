#!/usr/bin/env node
// Gera o src/sitemap.xml a partir da lista de rotas: cada página em cada língua, com as
// alternativas (hreflang) que dizem ao Google que /careers e /en/careers são a mesma página.
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

// O que entra em TODAS as páginas: cabeçalho, rodapé, componentes partilhados, o shell
// do index.html e o <head> que o SeoService escreve (canónico, alternativas, dados
// estruturados). As traduções entram à parte, cada língua com o seu ficheiro.
const PARTILHADO = [
  'src/app/core/header',
  'src/app/core/footer',
  'src/app/shared',
  'src/app/app.ts',
  'src/app/app.html',
  'src/app/core/services/seo.service.ts',
  'src/index.html',
];

// O português fica na raiz (as moradas que o Google já conhecia); as outras línguas têm
// prefixo. Tem de bater com LINGUAS_COM_PREFIXO em src/app/core/services/language.ts e com
// o SeoService: o hreflang de cada página tem de dizer o mesmo que o sitemap.
const LINGUAS = [
  { hreflang: 'pt-PT', prefixo: '', traducoes: 'src/assets/i18n/pt-PT.json' },
  { hreflang: 'en', prefixo: '/en', traducoes: 'src/assets/i18n/en.json' },
  { hreflang: 'fr', prefixo: '/fr', traducoes: 'src/assets/i18n/fr.json' },
  { hreflang: 'es', prefixo: '/es', traducoes: 'src/assets/i18n/es.json' },
];

// A ordem aqui é a ordem do sitemap. O caminho é o mesmo que está nos canonicals:
// sem barra final. As duas formas respondem 200 (ver o workflow), mas só uma é a canónica.
// Cada rota sai uma vez por língua: '/careers', '/en/careers', '/fr/careers', '/es/careers'.
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

/** '/' em inglês é '/en', e não '/en/': o mesmo que o canónico da página. */
const naLingua = (caminho, { prefixo }) => SITE + (caminho === '/' ? prefixo || '/' : prefixo + caminho);

const urls = ROTAS.flatMap(({ caminho, fontes }) => {
  const datasDaPagina = [...fontes, ...PARTILHADO].map(dataDoUltimoCommit).filter(Boolean);
  const alternativas = [
    ...LINGUAS.map((lingua) => ({ hreflang: lingua.hreflang, href: naLingua(caminho, lingua) })),
    // Quem não fala nenhuma das quatro vai para o português.
    { hreflang: 'x-default', href: naLingua(caminho, LINGUAS[0]) },
  ];
  return LINGUAS.map((lingua) => {
    const loc = naLingua(caminho, lingua);
    // Mudar só o en.json não muda a página portuguesa.
    const datas = [...datasDaPagina, dataDoUltimoCommit(lingua.traducoes)].filter(Boolean);
    const lastmod = datas.length ? datas.sort().at(-1) : anteriores[loc];
    return { loc, lastmod, alternativas };
  });
});

if (semHistorico) {
  console.warn('gerar-sitemap: sem histórico do git — mantidos os lastmod anteriores.');
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...urls.map(({ loc, lastmod, alternativas }) =>
    [
      '    <url>',
      `        <loc>${loc}</loc>`,
      ...(lastmod ? [`        <lastmod>${lastmod}</lastmod>`] : []),
      // O Google exige que cada <url> liste TODAS as versões, incluindo a própria.
      ...alternativas.map(
        ({ hreflang, href }) => `        <xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}"/>`,
      ),
      '    </url>',
    ].join('\n'),
  ),
  '</urlset>',
  '',
].join('\n');

writeFileSync(DESTINO, xml);
console.log(`gerar-sitemap: ${urls.length} URLs escritos em src/sitemap.xml`);
for (const { loc, lastmod } of urls) console.log(`  ${lastmod ?? '(sem data)'}  ${loc}`);
