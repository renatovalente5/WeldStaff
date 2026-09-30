# WeldStaff no GitHub Pages

A migração está **concluída**. O site é servido pelo GitHub Pages a partir do repositório
[WeldStaff](https://github.com/renatovalente5/WeldStaff), em `https://weldstaff.pt`, com
certificado emitido pelo GitHub. O `weldstaff.com` faz 301 para o `.pt` pela Cloudflare. O
email continua na Hostinger, independente do alojamento do site.

O que ficou feito, por ordem: DNS migrado do `host-redirect.com` para a Hostinger, HTTPS ligado,
as 6 rotas confirmadas a 200 sem redirecionamento, formulário de contacto reparado (estava a
falhar em silêncio desde fevereiro de 2026, por falta de `turnstile.execute()`) e confirmado a
receber candidaturas reais, chave da Google Maps apagada, e a VPS desligada.

O histórico dos passos de DNS está no git, no commit que criou este ficheiro.

---

## Fora do código

1. **Anexos das candidaturas (Worker):** resolvido em setembro de 2026, na passagem do Resend para
   o Hostinger. Os anexos seguem em base64 (1,33x em vez de 3,57x), o Worker impõe os mesmos
   limites da interface (3 ficheiros, cada um com menos de 5 MiB) e lê o corpo só até ao teto,
   mesmo quando o pedido não declara o tamanho. O caminho de volta pelo Resend também passou a
   base64: com o Buffer em JSON, 15 MB de CVs davam ~54 MB, acima dos 40 MB que o Resend aceita.
   Pelas contas, as candidaturas maiores já falhavam antes da troca — não foi confirmado em
   produção.

2. **Publicar o Worker.** A capitalização «Weldstaff» → «WeldStaff» entra em vigor com o deploy da
   troca para o Hostinger. Os filtros por assunto continuam a apanhar os emails: os assuntos
   ficaram exatamente iguais. O que muda é o remetente — `geral@weldstaff.pt`, com o nome
   «Formulário WeldStaff», em vez de `no-reply@weldstaff.pt`.

3. **Resend retirado a 30 de setembro de 2026.** Nos seis dias com a reserva ligada nenhum
   formulário precisou dela: as quatro candidaturas reais chegaram todas pelo Hostinger. Saiu o ramo
   `resend` e a reserva do Worker (publicado, versão `b18c8a8d`), os segredos `RESEND_API_KEY`
   e `CONTACT_FROM_EMAIL`, e os registos DNS `TXT send`, `MX send` e `TXT resend._domainkey`
   (confirmado no servidor autoritativo). Do lado do Resend, o dono removeu o domínio e a chave;
   confirmado a 30 de setembro: a conta ficou sem domínios, chaves, webhooks nem contactos. Ficam
   os 8 envios antigos e os respetivos logs (até 24 de setembro), que o Resend apaga sozinho ao
   fim de 30 dias — por volta de 24 de outubro. Não há botão nem API para os apagar antes; só
   pedindo ao suporte do Resend.

4. **Línguas com morada própria (30 de setembro de 2026).** Até aqui o inglês, o francês e o
   espanhol só existiam no browser, depois de escolhidos no seletor: o Google via uma página em
   português por morada. Passaram a ter 18 moradas novas (`/en/…`, `/fr/…`, `/es/…`), com
   `hreflang` nas páginas e no sitemap. O Bing recebe-as pelo IndexNow no deploy; o Google volta a
   ler o sitemap sozinho (a última leitura tinha sido a 29 de setembro). No Search Console, em
   Páginas, as 24 devem aparecer nas semanas seguintes.

5. **DMARC em quarentena (30 de setembro de 2026).** O `_dmarc` passou de `p=none` a
   `v=DMARC1; p=quarantine; rua=mailto:geral@weldstaff.pt`: um email que finja ser da weldstaff.pt
   sem o ser vai para o Spam de quem o recebe. Antes de mudar confirmou-se que só a Hostinger envia
   em nome do domínio (o SPF só inclui `_spf.mail.hostinger.com`, e o DKIM é o `hostingermail-*`).
   Os relatórios agregados (XML, de Google, Microsoft…) chegam à `geral@`. Um serviço novo que
   passe a enviar em nome da weldstaff.pt tem de entrar no SPF e assinar com DKIM, senão os
   emails dele vão para o Spam.

---

## Decisões de texto que ficaram para ti

Saíram da revisão linguística das quatro línguas. Nenhuma é um defeito — são escolhas que só o
dono do site pode fazer, e todas foram deixadas como estavam.

1. **Capitalização.** O site usa Maiúsculas De Título à inglesa em títulos e botões. Em português
   e em francês isso é incorreto (só a primeira palavra leva maiúscula); em espanhol é comum em
   marketing. Corrigir metade fica pior do que não corrigir nada, por isso é uma decisão em bloco,
   por língua. São cerca de 60 chaves.

2. **Variante do inglês.** O `en.json` é coerentemente americano (16 ocorrências de `-iz-`, zero
   de `-is-`). Sendo a empresa europeia e o público da UE, o britânico defende-se — mas é uma
   passagem global às 16 ocorrências, não a meia dúzia de chaves.

3. **Espaços insecáveis em francês.** A norma francesa manda espaço insecável antes de `:` `;`
   `!` `?`. O ficheiro tem zero. São cerca de 39 sítios, também tudo ou nada.

4. **Grafia da morada.** Há duas no site: «Rua Vasco da Gama 218» (contactos, mapa, rodapé) e
   «Rua Vasco da Gama, Nº 218» (privacidade e termos). Além disso o en/fr/es acrescentam
   «, Portugal» nas páginas legais e o pt-PT não. Convém fixar uma forma e usar `n.º` em vez
   de `Nº`.

5. **Título da página inicial.** Existem dois em circulação: «WeldStaff - Soluções de Soldadura»
   (no `index.html`) e «WeldStaff - Soldadores Qualificados para a Sua Empresa» (em
   `home.seo.title`, que é o que fica no separador). Decidir qual é o canónico. (O terceiro, o
   `title` da rota, saiu a 30 de setembro de 2026: repunha-se por cima do traduzido.)

6. **Localização das vagas — decidido a 30 de setembro de 2026.** As 6 chaves
   `careers.jobs.*.location` estão vazias e o `locationKey` nunca é preenchido. O dono decidiu não
   publicar localidade, tipo de contrato nem salário, e não quer as vagas no Google Jobs: por isso
   não há `JobPosting` nos dados estruturados, e não deve haver.

7. **Mensagens de validação do modal de candidatura.** Estão traduzidas nas 4 línguas mas o
   template nunca as mostra: o candidato vê a borda vermelha e o botão desativado sem saber o
   que está mal. A correção é mostrá-las por baixo de cada campo, não apagar as chaves.

8. **Cerca de 25 chaves por língua estão mortas** — nenhum template as usa. Entre elas os 7
   `placeholder` (nenhum template tem esse atributo), as 5 `contacts.form.options.*` (o
   formulário não tem `<select>`) e todo o ramo `careers.modal.*`. Se este voltar a ser ligado,
   atenção: o `routerLink='/contactos'` lá dentro fica **inerte**, porque o Angular não compila
   diretivas em conteúdo injetado por `[innerHTML]` — tem de passar a `href='/contactos'`, com o
   prefixo da língua nas outras (`href='/en/contactos'` no `en.json`).

9. **Língua dos emails internos.** Uma candidatura submetida em francês chega a
   `geral@weldstaff.pt` com o título da vaga em francês, pelo que a mesma vaga aparece com
   quatro nomes e não se consegue agrupar. Convinha enviar sempre a designação em português.
