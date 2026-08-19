# NegocIAJá — handoff mestre

Atualizado em 19 de agosto de 2026. Este é o primeiro arquivo que qualquer novo chat deve ler antes de alterar o projeto.

## Instrução para retomada

1. Leia `AGENTS.md`, este arquivo e `docs/CLOUDFLARE.md`.
2. Preserve os IDs e nomes Cloudflare registrados abaixo. Não recrie D1, R2, Worker, Access ou domínios.
3. Consulte a produção antes de qualquer mutação e mantenha a versão anterior disponível para rollback.
4. Execute `npm.cmd install` apenas quando necessário e depois `npm.cmd run check`.
5. Exija CI verde e homologação antes de merge/deploy.

## Objetivo do produto

NegocIAJá é uma plataforma SaaS multissegmento para atendimento conversacional, catálogo, pedidos, vendas, automações e operação. A landing é pública; o painel e a API são privados e protegidos pelo Cloudflare Access.

## Repositório

- Repositório: `https://github.com/sercominteligente/negociaja`
- Branch principal: `main`
- Branch de recuperação: `agent/recovery-foundation`
- Draft PR: `#1`

Arquivos principais:

- `src/index.ts`: Worker e API.
- `public/index.html`: landing.
- `public/app.html` e `public/app.js`: painel.
- `public/styles.css`: UI.
- `wrangler.jsonc`: configuração Cloudflare.
- `migrations/`: D1.
- `docs/CLOUDFLARE.md`: operação e rollback.

## Produção conhecida

- Landing: `https://negociaja.com.br/`
- Landing alternativa: `https://www.negociaja.com.br/`
- Painel: `https://app.negociaja.com.br/`
- Worker: `negociaja`
- Versão ativa registrada no handoff local perdido: `1bfd75f2-f9c9-479c-8e91-de53767ea2db`
- Versão anterior estável: `8a0f607e-712f-4347-b48a-81a86142443a`

A produção foi publicada manualmente por Wrangler. O checkout local que produziu essa versão foi perdido antes do push. Portanto, não assumir que `main` representa exatamente a produção.

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

Um único Cloudflare Worker com Static Assets, D1 e R2. Landing, painel e API compartilham o deploy. D1 guarda dados relacionais; R2 fica reservado a anexos.

Queues só entram quando houver trabalho assíncrono real. Durable Objects só entram para coordenação forte/WebSockets. Workers AI, AI Gateway e Vectorize só entram quando houver inferência/RAG real.

## Bindings e variáveis

- `DB` → D1 `negocia-ja-bd`.
- `FILES` → R2 `negocia-ja-files`.
- `ASSETS` → `public/`.
- `assets.run_worker_first=true` para que autenticação/roteamento do Worker ocorram antes dos arquivos estáticos.
- `APP_ENVIRONMENT=production`.
- `DEFAULT_TENANT_ID=tenant_demo`.
- `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` são identificadores públicos, não secrets.

Nunca versionar tokens OAuth/API.

## Banco remoto

Migrations já aplicadas e registradas no D1 remoto:

1. `0001_initial.sql`
2. `0002_seed_demo.sql`
3. `0003_platform_core.sql`

Não reaplicar nem recriar o banco. Antes de migration futura, listar pendentes e fazer export remoto.

## Segurança reconstruída na branch de recuperação

- JWT do Cloudflare Access validado no Worker com JWKS, issuer e AUD usando `jose`.
- Worker executa antes dos Static Assets, evitando bypass da autenticação por arquivo estático.
- API em raiz/`www` responde 404.
- `/app` em raiz/`www` redireciona para `app.negociaja.com.br`.
- Tenant não é aceito por `x-tenant-id`; por enquanto vem de `DEFAULT_TENANT_ID` no servidor.
- Mutations exigem origem válida, JSON e corpo máximo de 64 KiB em produção.
- Entradas, enums, quantidades, estoque, status e valores são validados.
- Status de pedido precisa existir no workflow do tenant, exceto `cancelled`.
- Painel renderiza dados dinâmicos com DOM APIs/`textContent`, não `innerHTML` com dados do D1.
- CSP, HSTS, `noindex` privado, `nosniff`, frame denial, referrer policy e permissions policy são aplicados pelo Worker.

Ainda falta homologação comportamental antes de considerar esta reconstrução equivalente à produção.

## Build e CI

`.github/workflows/ci.yml` executa `npm install` e `npm run check` em PRs, sem publicar o Worker. `main` também será validado em push quando o workflow for incorporado.

Causas reais encontradas na antiga falha de build:

- `@cloudflare/workers-types@^4.20260818.0` não existia no npm.
- Workers Types v5 com Wrangler 4.31.0 gerava conflito de peer dependency quando fixados exatamente.

A branch foi alinhada, sem `--force`/`--legacy-peer-deps`, às versões que passaram instalação e `npm run check` no GitHub Actions:

- `jose` `6.2.8`
- `@cloudflare/workers-types` `5.20260813.1`
- `typescript` `5.9.2`
- `wrangler` `4.123.0`

`npm run check` cobre TypeScript, `node --check public/app.js` e `wrangler deploy --dry-run`.

## Identidade visual

A frase aprovada `O sistema se adapta ao seu negócio.` já foi restaurada na landing da branch de recuperação.

Os binários oficiais de marca (`public/brand`, ícones, manifest e variantes de logo) não estão no GitHub histórico recuperado. Não regenerar nem substituir por aproximações. Recuperar os arquivos oficiais antes do merge final de branding.

## Ponto de continuidade

1. Recuperar os binários oficiais de identidade visual que ainda não estão no GitHub.
2. Fazer homologação/preview separado da branch recuperada, sem substituir produção.
3. Comparar landing, painel, API, Access e D1 com o comportamento da produção.
4. Implementar associação usuário↔tenant antes de múltiplas empresas reais.
5. Somente depois decidir sobre merge para `main` e reativar o fluxo automático de produção.
6. Concluir branding da tela de login do Cloudflare Access sem alterar a política Allow.

## Branding desejado do Access

- Logo: `https://negociaja.com.br/brand/logo-primary.png`
- Background: `#F7FAFF`
- Texto: `#071A43`
- Cabeçalho: `Bem-vindo ao NegocIAJá!`
- Rodapé: `Atendimento, vendas e operação em um único fluxo.`

## Rollback

```powershell
npx wrangler rollback 8a0f607e-712f-4347-b48a-81a86142443a
```

Rollback de Worker não reverte D1.
