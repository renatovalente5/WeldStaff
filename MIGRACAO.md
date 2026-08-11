# Migração para o GitHub Pages — o que falta fazer

Tudo o que depende de código está feito e publicado. O site já está a ser servido pelo GitHub
Pages e foi testado com o cabeçalho `Host: weldstaff.pt` **antes** de mexer no DNS. Falta a
mudança de DNS, que é a única coisa que muda o que o público vê.

---

## 1. Mudar o DNS

Os nameservers do `weldstaff.pt` são `dns1..4.host-redirect.com`. No painel onde geres esse DNS:

**Apagar:**

| Tipo | Nome | Conteúdo |
|---|---|---|
| A | `@` | `38.242.203.192` (a VPS) |
| A ou CNAME | `www` | o que apontar para a VPS |

**Criar** — quatro registos `A` no nome `@`, com TTL 300 enquanto propaga:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

**Criar** — um `CNAME` no nome `www` para:

```
renatovalente5.github.io
```

**Não tocar** nos registos de email: os dois `MX` da Hostinger, o `TXT` do SPF e o TXT de
verificação. O alojamento do site muda; o email é independente e continua na Hostinger.

Confirmar quando propagar:

```bash
dig +short weldstaff.pt A
```

## 2. Ligar o HTTPS

Assim que o DNS apontar para o GitHub, ir a **Settings → Pages** do repositório
[WeldStaff](https://github.com/renatovalente5/WeldStaff) e ligar **Enforce HTTPS**. A opção só
aparece depois de o GitHub emitir o certificado Let's Encrypt, o que leva alguns minutos. O
certificado cobre `weldstaff.pt` e `www.weldstaff.pt` e renova-se sozinho — não é preciso
certbot nem nada na VPS.

> O certificado atual da VPS expira a **13 de agosto de 2026, 22:23 UTC**. Se a mudança de DNS
> ficar feita antes disso, não há nada a renovar.

## 3. Testar em produção

```bash
for p in / /contactos /careers /privacidade /cookies /termos; do
  printf "%-14s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://weldstaff.pt$p)"
done
```

Todos devem dar **200**. Depois, o teste que mais importa: **submeter o formulário de contacto em
`https://weldstaff.pt/contactos` e confirmar que o email chega a geral@weldstaff.pt.** Esse
formulário estava a falhar em silêncio desde fevereiro; a correção está feita e testada
localmente, mas o Turnstile só valida os domínios autorizados no painel da Cloudflare — por isso
tem de ser confirmado no domínio real.

Se der erro, verificar em **Cloudflare → Turnstile → widget `0x4AAAAAACZQ10coPVfv7XWU` →
Hostname Management** que `weldstaff.pt` está na lista.

## 4. Redirecionar o weldstaff.com

O GitHub Pages só serve um domínio por repositório. Hoje o `weldstaff.com` aponta para a VPS e faz
301 para o `.pt` — quando a VPS for desligada, deixa de responder. Configurar o redirecionamento
no registrar do `.com`, para `https://weldstaff.pt`.

Nota: o `weeldstaff.com`, que aparecia nas regras antigas do nginx, **não está registado**. Essas
regras protegiam um domínio que não existe.

## 5. Só depois: desligar a VPS

Confirmar primeiro que o `weldstaff.pt` responde pelo GitHub (`curl -sI https://weldstaff.pt | grep -i server`
deve dizer `GitHub.com`) e que o formulário de contacto envia. Só então desligar o contentor.

A VPS também aloja o `sininhosoportunos.pt`, no mesmo IP — confirmar que esse já está migrado
antes de a desligar de vez.

---

## Fora do código, e só tu podes fazer

1. **Apagar a chave da Google Maps** `AIzaSyAZmE3DtwTFTPZno9AZpINJzECQIhSIloI` na Google Cloud.
   Está confirmadamente **sem restrições** (responde a Static Maps com qualquer referenciador) e
   é facturada ao teu projeto. O site já não a usa — o mapa é um iframe sem chave —, mas a chave
   continua válida para quem a tenha copiado do HTML antigo.

2. **Decidir o texto da secção RAL de `/termos`.** A página mostra literalmente
   `terms.sections.ral.title` e `terms.sections.ral.text`, nas 4 línguas — já hoje, em produção.
   As chaves não existem em nenhum ficheiro de tradução. Não inventei texto legal: ou fornecês o
   texto oficial da entidade RAL competente, ou confirmas com aconselhamento jurídico que a
   Lei 144/2015 não se aplica (é sobre relações de consumo, e a WeldStaff é B2B + recrutamento) e
   removem-se as duas linhas de `terms.html:51-52`.

3. **Espanhol:** 30 dos 296 textos do `es.json` estão em português, incluindo o botão
   «Pedir contacto» do menu e o modal de candidatura. Ou se revê, ou se retira o espanhol.

4. **Anexos das candidaturas (Worker):** não mexi no `worker/`, porque não o consigo testar nem
   publicar. Ficam anotados dois pontos: os anexos são serializados como `Buffer` em JSON (3,57x
   de expansão, e no máximo que a interface permite — 3 ficheiros de 5 MB — o pico de memória
   ronda 137 MB contra o limite de 128 MB do isolate), e não existe validação de tamanho do lado
   do servidor. Passar a base64 e impor um teto resolve.
