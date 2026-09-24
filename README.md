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
npm test               # o Worker verdadeiro contra um Hostinger e um Resend falsos — não envia email
npm run dev            # http://localhost:8787
npm run deploy         # confirma os segredos e só depois faz `wrangler deploy`
```

Endpoints: `POST /contact` (JSON) e `POST /apply` (multipart, até 3 anexos com menos de 5 MiB
cada, dos tipos da lista `TIPOS_ANEXO`). Ambos validam o Turnstile e enviam email pela
**Hostinger Mail API**, a partir da caixa `HOSTINGER_SENDER` (`geral@weldstaff.pt`) para
`CONTACT_TO_EMAIL`. O Resend fica como caminho de volta: `EMAIL_PROVIDER` no `wrangler.jsonc`.

**Não há Reply-To.** A API do Hostinger não o tem (nem `from`, nem cabeçalhos), por isso o
«Responder» do programa de email vai para a própria caixa. Cada email traz um botão «Responder a
&lt;nome&gt;» com o endereço do visitante, e o remetente chama-se «Formulário WeldStaff» para não
parecer que o «Responder» vai para o candidato. SMTP não é alternativa: `smtp.hostinger.com` está
atrás da Cloudflare, e um Worker não pode abrir ligações para IPs da Cloudflare.

Cada envio deixa uma cópia na pasta **Enviados** da `geral@`, com os anexos. A política de
privacidade promete apagar candidaturas ao fim de 12 meses: essa pasta conta.

A bateria precisa de rede: o Turnstile usa as chaves de teste da Cloudflare, e um dos casos faz
um pedido com um token inválido à API do Hostinger (para provar que uma morada de teste posta em
produção é ignorada). Não envia email nenhum.

Os segredos estão listados em [`worker/.dev.vars.example`](worker/.dev.vars.example) e definem-se
com `pbpaste | npx wrangler secret put <NOME>`. **Não estão neste repositório.** O
`HOSTINGER_API_TOKEN` cria-se em hPanel → Emails → weldstaff.pt → Programadores → Chaves de API,
restrito à caixa que envia: não existe permissão «só enviar», e o token lê e apaga tudo nas caixas
que abrange. `npm run deploy` recusa publicar se faltar um segredo de que o fornecedor precisa.

Mudar `EMAIL_PROVIDER` só no painel da Cloudflare não dura: o `wrangler.jsonc` substitui as
variáveis do painel a cada deploy.

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
