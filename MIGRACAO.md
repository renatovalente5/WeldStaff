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

1. **Anexos das candidaturas (Worker):** não mexi no `worker/`, porque não o consigo testar nem
   publicar. Ficam anotados dois pontos: os anexos são serializados como `Buffer` em JSON (3,57x
   de expansão, e no máximo que a interface permite — 3 ficheiros de 5 MB — o pico de memória
   ronda 137 MB contra o limite de 128 MB do isolate), e não existe validação de tamanho do lado
   do servidor. Passar a base64 e impor um teto resolve.

2. **Publicar o Worker.** A capitalização da marca nos emails («Weldstaff» → «WeldStaff», três
   sítios, incluindo o assunto) está corrigida no código mas **não entra em vigor sem um
   `wrangler deploy`** na pasta `worker/`. Até lá os emails continuam a chegar como estão. Os
   filtros que criaste no Hostinger continuam a apanhá-los: a correspondência de assunto não
   distingue maiúsculas.

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

5. **Título da página inicial.** Existem três em circulação: «WeldStaff - Soluções de Soldadura»
   (no `index.html` e na rota) e «WeldStaff - Soldadores Qualificados para a Sua Empresa» (em
   `home.seo.title`, que é o que fica no separador). Decidir qual é o canónico.

6. **Localização das vagas.** As 6 chaves `careers.jobs.*.location` estão vazias e o
   `locationKey` nunca é preenchido. Três das vagas dizem a localização no próprio título
   (Ribatejo, Setúbal, Aveiro); as outras três não a têm em lado nenhum, e não a inventei.

7. **Mensagens de validação do modal de candidatura.** Estão traduzidas nas 4 línguas mas o
   template nunca as mostra: o candidato vê a borda vermelha e o botão desativado sem saber o
   que está mal. A correção é mostrá-las por baixo de cada campo, não apagar as chaves.

8. **Cerca de 25 chaves por língua estão mortas** — nenhum template as usa. Entre elas os 7
   `placeholder` (nenhum template tem esse atributo), as 5 `contacts.form.options.*` (o
   formulário não tem `<select>`) e todo o ramo `careers.modal.*`. Se este voltar a ser ligado,
   atenção: o `routerLink='/contactos'` lá dentro fica **inerte**, porque o Angular não compila
   diretivas em conteúdo injetado por `[innerHTML]` — tem de passar a `href='/contactos'`.

9. **Língua dos emails internos.** Uma candidatura submetida em francês chega a
   `geral@weldstaff.pt` com o título da vaga em francês, pelo que a mesma vaga aparece com
   quatro nomes e não se consegue agrupar. Convinha enviar sempre a designação em português.
