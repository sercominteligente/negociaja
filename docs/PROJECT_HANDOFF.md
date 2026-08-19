# NegocIAJá — handoff mestre

Atualizado em 19 de agosto de 2026. Este é o primeiro arquivo que qualquer novo chat deve ler antes de alterar o projeto.

## Instrução para retomada

1. Leia `AGENTS.md`, este arquivo e `docs/CLOUDFLARE.md`.
2. Preserve os IDs e nomes Cloudflare registrados abaixo. Não recrie D1, R2, Worker, Access ou domínios.
3. Consulte a produção antes de qualquer mutação e mantenha a versão anterior disponível para rollback.
4. Execute `npm.cmd install` apenas quando necessário e depois `npm.cmd run check`.

## Objetivo do produto

NegocIAJá é uma plataforma SaaS multissegmento para atendimento conversacional, catálogo, pedidos, vendas, automações e operação. A landing é pública; o painel e a API devem permanecer protegidos pelo Cloudflare Access.

## Repositório

- Repositório: `https://github.com/sercominteligente/negociaja`
- Branch principal: `main`
- Branch de recuperação: `agent/recovery-foundation`
- Draft PR de recuperação: `#1`

Arquivos principais:

- `src/index.ts`: Worker e API.
- `public/index.html`: landing page.
- `public/app.html` e `public/app.js`: painel.
- `public/styles.css`: UI.
- `wrangler.jsonc`: configuração Cloudflare.
- `migrations/`: esquema e dados iniciais do D1.
- `docs/CLOUDFLARE.md`: operação e rollback.

## Produção conhecida

- Landing: `https://negociaja.com.br/`
- Landing alternativa: `https://www.negociaja.com.br/`
- Painel protegido: `https://app.negociaja.com.br/`
- Worker: `negociaja`
- Versão ativa registrada no handoff local perdido: `1bfd75f2-f9c9-479c-8e91-de53767ea2db`
- Versão anterior estável: `8a0f607e-712f-4347-b48a-81a86142443a`

A produção foi publicada manualmente por Wrangler e estava funcional quando o handoff original foi escrito. O código local que gerou essa versão foi perdido antes de chegar ao GitHub; portanto, não assumir que `main` representa exatamente a produção.

## Inventário Cloudflare

- Account ID: `d750711fce41908fe354fa2e7284d6be`
- Zona `negociaja.com.br`: `4b4b88175763980e9079b0f063a78348`
- D1 `negocia-ja-bd`: `25ad2242-5226-467d-9f69-bbdd244fb2ca`
- R2: `negocia-ja-files`
- Access app `NegocIAJá — Painel`: `5968e554-56ee-4739-bfb8-92e2b0f5287c`
- Access AUD: `f10e7d76c9531823e695b17cb3c938b5ff6584e68663ec2e65a820d3be85e218`
- Access team domain: `https://bitter-cell-31bf.cloudflareaccess.com`

Não existem atualmente Pages, KV, Queues, Durable Objects, Vectorize ou AI Gateway. Não criar esses recursos até existir caso de uso implementado.

## Arquitetura decidida

Usar um único Cloudflare Worker com Static Assets, D1 e R2. Landing, painel e API compartilham o deploy. D1 guarda dados relacionais; R2 fica reservado a anexos.

Queues só entram quando houver trabalho assíncrono real. Durable Objects só entram para coordenação forte/WebSockets. Workers AI, AI Gateway e Vectorize só entram quando houver inferência/RAG real.

## Bindings e variáveis

- `DB` → D1 `negocia-ja-bd`.
- `FILES` → R2 `negocia-ja-files`.
- `ASSETS` → `public/`.
- `APP_ENVIRONMENT=production`.
- `DEFAULT_TENANT_ID=tenant_demo`.
- `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` são identificadores públicos, não secrets.

Não há secrets obrigatórios no código conhecido atual. Nunca versionar tokens OAuth/API.

## Banco remoto

Migrations já aplicadas e registradas no D1 remoto:

1. `0001_initial.sql`
2. `0002_seed_demo.sql`
3. `0003_platform_core.sql`

Não reaplicar nem recriar o banco. Antes de migration futura, listar pendentes e fazer export remoto.

## Segurança reconstruída na branch de recuperação

A branch `agent/recovery-foundation` agora reconstrói os controles descritos pelo handoff original:

- `app.negociaja.com.br` exige JWT do Cloudflare Access também dentro do Worker.
- JWT validado criptograficamente com JWKS, issuer e AUD usando `jose`.
- API em `negociaja.com.br` e `www.negociaja.com.br` responde 404.
- `/app` na raiz e em `www` redireciona ao hostname protegido.
- Tenant não é mais aceito pelo header `x-tenant-id`; enquanto não existir associação usuário↔tenant, usa `DEFAULT_TENANT_ID` no servidor.
- Mutations exigem origem `https://app.negociaja.com.br`, `application/json` e corpo máximo de 64 KiB em produção.
- Nomes, enums, quantidades, estoque, status e valores possuem validação de servidor.
- `public/app.js` não envia tenant pelo navegador e renderiza dados dinâmicos com `textContent`/DOM APIs, sem `innerHTML` com dados do D1.
- CSP, HSTS, `noindex` no conteúdo privado, `nosniff`, frame denial, referrer policy e permissions policy são aplicados pelo Worker.
- O status de pedido precisa pertencer ao workflow do tenant, exceto `cancelled`.

Essa reconstrução ainda não equivale à produção até passar homologação. Não fazer merge nem deploy apenas com base nesta seção.

## Validação automatizada de recuperação

Foi criado `.github/workflows/ci.yml` na branch de recuperação. O workflow executa `npm install` e `npm run check`, que cobre TypeScript, sintaxe do JavaScript do painel e `wrangler deploy --dry-run`. Ele não publica o Worker.

Em 19 de agosto de 2026, o primeiro CI revelou que `@cloudflare/workers-types@^4.20260818.0` não existia no npm. A dependência foi corrigida para uma versão publicada (`^5.20260813.1`). Após a correção, instalação e `npm run check` concluíram com sucesso no GitHub Actions.

## Comandos seguros

```powershell
npm.cmd install
npm.cmd run types
npm.cmd run db:local
npm.cmd run check
npm.cmd run dev
npm.cmd run db:remote:list
npm.cmd run deploy
```

`npm run check` executa TypeScript, valida o JavaScript do painel e faz dry-run do deploy.

## Ponto de continuidade

1. Comparar a branch recuperada com o comportamento real da produção sem alterar produção.
2. Recuperar/aplicar a identidade visual pública ainda ausente no GitHub, se necessário.
3. Preparar ambiente de homologação/preview separado para smoke tests reais.
4. Somente depois decidir sobre merge para `main`.
5. Corrigir o pipeline de Workers Builds quando o GitHub representar a aplicação correta.
6. Concluir branding da tela de login do Cloudflare Access.
7. Criar homologação separada antes de dados reais e múltiplos tenants.
8. Implementar associação usuário↔tenant antes de onboarding multiempresa.

## Branding desejado do Access

- Logo: `https://negociaja.com.br/brand/logo-primary.png`
- Background: `#F7FAFF`
- Texto: `#071A43`
- Cabeçalho: `Bem-vindo ao NegocIAJá!`
- Rodapé: `Atendimento, vendas e operação em um único fluxo.`

Não alterar a política Allow existente durante o branding.

## Rollback

Versão anterior estável registrada:

```powershell
npx wrangler rollback 8a0f607e-712f-4347-b48a-81a86142443a
```

Rollback de Worker não reverte D1.
