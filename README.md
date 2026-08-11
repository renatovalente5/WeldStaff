# WeldStaff — Website

Site institucional da **WeldStaff Industrial Services** — outsourcing de soldadura e recrutamento
industrial (soldadores, tubistas, serralheiros), em Santa Maria da Feira.

- **Domínio:** [weldstaff.pt](https://weldstaff.pt/)
- **Frontend:** Angular 21 (standalone components, Transloco i18n em PT/EN/FR/ES), **pré-renderizado
  estaticamente** e alojado no **GitHub Pages**.
- **Backend:** Cloudflare Worker `weld-staff-api` (pasta `worker/`), que trata do formulário de
  contacto e das candidaturas. Vive fora deste alojamento e é publicado à parte.

Substitui a versão anterior que corria em Docker + Nginx numa VPS
(repositório antigo, privado: `renatovalente5/WeldOnPrime`).

## Desenvolvimento

```bash
npm ci
npm start          # http://localhost:4200
```

Build de produção, igual ao que é publicado:

```bash
npm run build      # gera dist/weld-staff/browser, já com as 6 rotas pré-renderizadas
```

Para servir o build localmente (com fallback de SPA):

```bash
python3 _dev/serve-dist.py    # http://localhost:8140
```

## Como é publicado

Qualquer push para `main` dispara [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), que
faz `npm ci`, `npm run build`, verifica que as 6 rotas foram pré-renderizadas, prepara o output e
publica no GitHub Pages.

O domínio personalizado vem de `public/CNAME` (**`weldstaff.pt`**, o apex). Não mudar para `www`
sem alinhar ao mesmo tempo o `canonical`, o `og:url`, o `sitemap.xml` e o `ALLOWED_ORIGIN` do
Worker — o Worker compara origens por string exata e um `www` não declarado bloqueia os formulários.

### Pré-renderização (SSG)

`angular.json` usa `outputMode: "static"`, o que gera um `index.html` real por rota
(`/`, `/contactos`, `/careers`, `/privacidade`, `/cookies`, `/termos`). É isso que faz os deep links
responderem HTTP 200 no GitHub Pages, que não tem reescrita de URLs.

Duas consequências a ter em conta ao mexer no código:

1. **Nada de APIs de browser durante o arranque.** O prerender corre em Node: `window`,
   `document`, `localStorage`, `IntersectionObserver` e `requestAnimationFrame` não existem. Usar
   `afterNextRender()` ou `isPlatformBrowser(PLATFORM_ID)`. Já está feito no `LanguageService`,
   no `CookieConsentComponent`, no `HeaderComponent`, nas diretivas `appScrollReveal`/`appCountUp`,
   no `TurnstileComponent` e nos `ngOnInit` das páginas.
2. **As traduções são lidas do disco no servidor.** [`src/app/transloco-loader.server.ts`](src/app/transloco-loader.server.ts)
   importa os JSON para o bundle do servidor, e um `provideAppInitializer` carrega o `pt-PT` antes
   do render. Sem isto o HTML estático saía com as chaves cruas em vez do texto.

## Estrutura

```
src/app/pages/          Início, Contactos, Carreiras, Privacidade, Cookies, Termos
src/app/core/           header, footer, serviços (SEO, língua, contacto, carreiras)
src/app/shared/         botão, cartão, título de secção, Turnstile, diretivas
src/assets/i18n/        traduções pt-PT, en, fr, es (fonte única)
src/assets/img|video/   imagens e o vídeo do hero
public/                 CNAME, favicons — copiado para a raiz do output
worker/                 Cloudflare Worker (API dos formulários)
_dev/                   servidor local para o build (não é publicado)
_source/                imagens originais em resolução alta (não é publicado)
```

## Worker (API dos formulários)

```bash
cd worker
npm ci
npm run dev            # http://localhost:8787
npm run deploy         # npx wrangler deploy
```

Endpoints: `POST /contact` (JSON) e `POST /apply` (multipart, com anexos). Ambos validam o
Turnstile e enviam email pelo Resend.

Os quatro segredos estão listados em [`worker/.dev.vars.example`](worker/.dev.vars.example) e
definem-se em produção com `npx wrangler secret put <NOME>`. **Não estão neste repositório.**

## Formulários

O widget Turnstile está em modo `execution: 'execute'`: o token só é emitido quando o código chama
`turnstileWidget.execute()`. Quem mexer nos formulários tem de manter essa chamada — sem ela o
payload segue com `turnstileToken` vazio e o Worker responde 400 sem que nada apareça nos logs.
Foi exatamente essa a causa de o formulário de contacto não enviar nada entre fevereiro e agosto
de 2026.

Os tokens do Turnstile são de uso único: pedir sempre um novo em cada envio, em vez de reutilizar.

## Notas

- **Sem cookies de terceiros no caminho crítico.** O script da Google Maps JavaScript API foi
  removido: o mapa da página de contactos é um iframe com `output=embed`, que não usa chave.
- As bandeiras do seletor de línguas são as 4 usadas, auto-hospedadas em
  `src/assets/img/flags/` ([`src/css-bandeiras.scss`](src/css-bandeiras.scss)), em vez do pacote
  `flag-icons` completo (que arrastava 542 SVGs para o output).
- `npm test` não tem testes escritos — não o meter no workflow enquanto assim for, porque sai
  sempre com código 1.
