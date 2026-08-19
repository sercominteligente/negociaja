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

## Recuperação do checkout perdido em 19/08/2026

O usuário localizou no PC o arquivo `negociaja.rar`. O conteúdo foi inspecionado e confirma que ele é uma cópia praticamente completa do checkout local perdido que produziu a versão publicada manualmente.

O arquivo recuperado contém, entre outros:

- `src/index.ts` original;
- `wrangler.jsonc` original de produção;
- `package.json` e `package-lock.json`;
- `worker-configuration.d.ts` gerado pelo Wrangler;
- `docs/PROJECT_HANDOFF.md` e `docs/CLOUDFLARE.md` originais;
- migrations `0001`, `0002` e `0003`;
- `dist/` da build;
- `public/brand.css`, `manifest.webmanifest` e `_headers`;
- os três PNGs oficiais da marca;
- favicon e ícones 16, 32, 180, 192 e 512 px.

Os binários oficiais recuperados são:

- `public/brand/logo-primary.png`;
- `public/brand/logo-primary-with-slogan.png`;
- `public/brand/logo-reverse-dark-bg.png`.

Não substituir esses arquivos por aproximações geradas. O conteúdo do RAR deve ser tratado como referência histórica da versão publicada, enquanto a branch `agent/recovery-foundation` preserva também as melhorias posteriores de CI, smoke tests e painel funcional. Fazer fusão seletiva, não sobrescrever a branch inteira pelo snapshot antigo.

## Produção conhecida

- Landing: `https://negociaja.com.br/`
- Landing alternativa: `https://www.negociaja.com.br/`
- Painel: `https://app.negociaja.com.br/`
- Worker: `negociaja`
- Versão ativa registrada no handoff recuperado: `1bfd75f2-f9c9-479c-8e91-de53767ea2db`
- Versão anterior estável: `8a0f607e-712f-4347-b48a-81a86142443a`
- Deployment anterior do template: `73c168b8-594b-4e59-b7d7-e2d19c38224e`
- Versão do template: `a36459f4-1275-4d8c-9540-00d829c8692c`

A produção foi publicada manualmente por Wrangler e validada visualmente. O `main` histórico não representa exatamente essa versão.

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
- `assets.run_worker_first=true` para que autenticação/roteamento ocorram antes dos arquivos estáticos.
- `APP_ENVIRONMENT=production`.
- `DEFAULT_TENANT_ID=tenant_demo`.
- `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` são identificadores públicos, não secrets.
- A branch de recuperação usa `compatibility_date=2026-08-18`, data já comprovada no runtime CI. O snapshot original usava `2026-08-19` com Wrangler `4.124.0`; só avançar a data depois de CI e smoke test verdes.

Nunca versionar tokens OAuth/API.

## Banco remoto

Migrations já aplicadas e registradas no D1 remoto:

1. `0001_initial.sql`
2. `0002_seed_demo.sql`
3. `0003_platform_core.sql`

Não reaplicar nem recriar o banco. Antes de migration futura, listar pendentes e fazer export remoto.

## Segurança reconstruída

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
- `.gitignore` bloqueia `.env`, `.dev.vars`, `.wrangler` e outros estados locais sensíveis.
- `scripts/security-check.mjs` impede regressões críticas de segurança no CI.

## Build e CI

`.github/workflows/ci.yml` executa validação sem publicar o Worker.

A branch atual conclui com sucesso:

- instalação de dependências;
- TypeScript;
- sintaxe do painel;
- regressões de segurança;
- `wrangler deploy --dry-run`;
- aplicação das migrations 0001/0002/0003 somente no D1 local do runner;
- inicialização real do Worker local;
- smoke test de health, catálogo, criação de item, criação de pedido, cálculo de total, status válido/inválido e Content-Type;
- prova de que `x-tenant-id` enviado pelo navegador não troca o tenant.

Nenhuma dessas validações escreve no D1 remoto ou publica Worker.

## Identidade visual

A identidade oficial foi recuperada do `negociaja.rar` e corresponde ao mini brand board aprovado.

Paleta oficial:

- `#0B2B7C` navy;
- `#169CFF` blue;
- `#25D9FF` cyan;
- `#FFC107` yellow;
- `#FF9800` orange;
- `#FFFFFF` white.

Ativos oficiais recuperados:

- logo principal horizontal;
- logo principal com slogan;
- versão reversa para fundo escuro;
- favicon e ícones PWA.

A frase aprovada da landing permanece: `O sistema se adapta ao seu negócio.`

## Ponto de continuidade

1. Incorporar os ativos oficiais recuperados à branch/repositório sem degradar os binários.
2. Comparar seletivamente `src/index.ts`, Wrangler, headers e HTML originais com a branch reconstruída, preservando as melhorias já validadas.
3. Preparar preview/homologação Cloudflare separado, sem substituir produção nem usar dados reais do D1 de produção para mutations.
4. Comparar landing, painel, API e Access com a produção.
5. Implementar associação usuário↔tenant antes de múltiplas empresas reais.
6. Evoluir clientes, conversas, pedidos, catálogo e automações.
7. Somente depois decidir sobre merge em `main` e pipeline automático de produção.
8. Concluir branding da tela de login do Cloudflare Access sem alterar a política Allow.

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
