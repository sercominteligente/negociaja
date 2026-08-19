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

## Segurança esperada da versão de produção

O handoff original registrava os seguintes controles na versão publicada manualmente, embora esse código exato tenha sido perdido localmente e ainda precise ser reconstruído no GitHub:

- `app.negociaja.com.br` protegido pelo Access.
- Validação criptográfica do JWT de Access usando JWKS e AUD.
- API pública em raiz e `www` respondendo 404.
- `/app` em raiz e `www` redirecionando para o hostname protegido.
- Tenant não vindo de header controlado pelo navegador.
- Mutations exigindo origem válida e JSON, com limite de corpo.
- Entradas, quantidades, status e valores validados.
- DOM montado com `textContent` para evitar XSS armazenado.
- CSP, HSTS, `noindex`, `nosniff`, frame denial e permissions policy.

Esses itens são requisitos de recuperação, não devem ser presumidos como presentes no `main` atual.

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

1. Recuperar no GitHub a configuração reproduzível de Wrangler e scripts de validação.
2. Reconstruir os controles de segurança da versão de produção em branch isolada.
3. Validar build/dry-run antes de qualquer merge para `main`.
4. Corrigir o pipeline de Workers Builds somente depois que o GitHub representar a aplicação correta.
5. Concluir branding da tela de login do Cloudflare Access.
6. Criar homologação separada antes de dados reais e múltiplos tenants.

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
