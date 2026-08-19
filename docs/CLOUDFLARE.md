# Cloudflare — operação do NegocIAJá

## Princípio

A configuração declarada em `wrangler.jsonc` é a fonte de verdade do Worker. Não recrie ou substitua recursos de produção para corrigir bindings, build ou homologação.

Produção e HML são ambientes diferentes. Nunca reutilize D1/R2 de produção em HML.

## Recursos de produção existentes

- Worker: `negociaja`
- Account ID: `d750711fce41908fe354fa2e7284d6be`
- Zona `negociaja.com.br`: `4b4b88175763980e9079b0f063a78348`
- D1 binding `DB` → `negocia-ja-bd` (`25ad2242-5226-467d-9f69-bbdd244fb2ca`)
- R2 binding `FILES` → `negocia-ja-files`
- Static Assets binding `ASSETS` → `public/`
- Domínios: `negociaja.com.br`, `www.negociaja.com.br`, `app.negociaja.com.br`
- Access app: `NegocIAJá — Painel` (`5968e554-56ee-4739-bfb8-92e2b0f5287c`)
- Access AUD: `f10e7d76c9531823e695b17cb3c938b5ff6584e68663ec2e65a820d3be85e218`
- Team domain: `https://bitter-cell-31bf.cloudflareaccess.com`

A versão ativa de produção permanece `1bfd75f2-f9c9-479c-8e91-de53767ea2db` enquanto o Draft PR #1 é homologado.

## Checkout de produção recuperado

O arquivo `negociaja.rar` localizado pelo usuário contém o checkout local de 19/08/2026 que havia ficado fora do GitHub. Ele recuperou o `wrangler.jsonc` histórico, fonte do Worker, documentação, build e ativos oficiais.

A branch `agent/recovery-foundation` usa esse snapshot como referência histórica, mas não volta cegamente para ele: preserva correções e testes posteriores já validados.

## Static Assets e autenticação

`assets.run_worker_first` deve permanecer `true`.

O Worker classifica/autentica a requisição antes de chamar `env.ASSETS.fetch()`. Isso evita que arquivos privados do painel sejam servidos diretamente antes da validação de segurança.

## Ambiente HML

`wrangler.jsonc` possui `env.hml`.

O ambiente HML deve publicar como Worker separado `negociaja-hml`, inicialmente via `workers.dev`, sem qualquer rota customizada de produção.

Configuração HML:

- `APP_ENVIRONMENT=hml`;
- `DEFAULT_TENANT_ID=tenant_demo`;
- `HML_USERNAME=homologacao`;
- `DB` declarado sem ID de produção;
- `FILES` declarado sem nome do bucket de produção;
- `HML_PASSWORD` somente como Worker secret;
- Basic Auth adicional no próprio Worker;
- sem senha válida, toda a HML retorna 401;
- mutations exigem a própria Origin da HML;
- conteúdo HML recebe `noindex` e `no-store`.

O Wrangler atual suporta provisioning automático de recursos quando bindings são declarados sem IDs. Portanto, o primeiro deploy HML deve provisionar recursos próprios em vez de reutilizar os recursos registrados acima.

Procedimento completo: `docs/HML.md`.

## Antes de deploy HML

1. Confirme branch `agent/recovery-foundation`.
2. Confirme CI verde.
3. Confirme no diff que `env.hml` não possui o ID D1 `25ad2242-5226-467d-9f69-bbdd244fb2ca`.
4. Confirme que `env.hml` não possui `bucket_name: negocia-ja-files`.
5. Execute somente `npx wrangler deploy --env hml`.
6. Nunca execute deploy sem `--env hml` durante a homologação.

Depois do primeiro deploy:

```powershell
npx wrangler secret put HML_PASSWORD --env hml
npx wrangler d1 migrations list DB --remote --env hml
npx wrangler d1 migrations apply DB --remote --env hml
```

Validar a URL `workers.dev` antes de criar hostname HML customizado.

## Antes de qualquer deploy de produção

1. Confirme que a HML foi homologada.
2. Confirme que está na branch correta e que o PR foi revisado deliberadamente.
3. Rode `npm.cmd run check`.
4. Confirme GitHub Actions verde.
5. Rode `npm.cmd run db:remote:list` e confirme que não há migration inesperada.
6. Não aplique migration automaticamente junto com deploy.
7. Confirme D1/R2 de produção pelos IDs/nomes registrados neste documento.
8. Preserve a versão anterior para rollback.

## Banco D1 de produção

Migrations já aplicadas:

- `0001_initial.sql`
- `0002_seed_demo.sql`
- `0003_platform_core.sql`

Nunca recriar o banco de produção para resolver erro de migration. Antes de nova migration, faça export remoto e liste pendentes.

## Deploy de produção

```powershell
npm.cmd run check
npm.cmd run deploy
```

Não executar enquanto o Draft PR #1 não estiver homologado e aprovado para produção.

## Workers Builds

A falha histórica de build tinha causas concretas:

- `@cloudflare/workers-types@^4.20260818.0` não existia no npm;
- Workers Types v5 com Wrangler histórico 4.31.0 expôs conflito de peer dependency;
- `compatibility_date=2026-08-19` não iniciava no workerd empacotado pelo Wrangler 4.123.0 usado no CI da recuperação.

A branch validada usa:

- `jose` `6.2.8`;
- `@cloudflare/workers-types` `5.20260813.1`;
- `typescript` `5.9.2`;
- `wrangler` `4.123.0`;
- `compatibility_date` `2026-08-18`.

Não usar `--force` ou `--legacy-peer-deps` para esconder incompatibilidade.

## CI

O GitHub Actions não publica Workers nem altera recursos remotos.

Ele valida:

- TypeScript e JavaScript do painel;
- regressões de segurança;
- Wrangler dry-run;
- D1/migrations local de desenvolvimento;
- smoke test real do Worker local;
- `/api/session`, `/api/customers`, catálogo e pedidos;
- isolamento contra `x-tenant-id`;
- D1/migrations local do ambiente HML;
- HML bloqueada sem autenticação;
- autenticação Basic HML;
- same-origin HML;
- mutation HML autenticada.

## Access de produção

`app.negociaja.com.br` permanece atrás do Cloudflare Access. O Worker também valida criptograficamente `Cf-Access-Jwt-Assertion` com JWKS, issuer e AUD.

Não alterar a política Allow durante branding.

Branding planejado:

- Logo: `https://negociaja.com.br/brand/logo-primary.png`
- Fundo: `#F7FAFF`
- Texto: `#071A43`
- Cabeçalho: `Bem-vindo ao NegocIAJá!`
- Rodapé: `Atendimento, vendas e operação em um único fluxo.`

## Gate antes de produção

Enquanto o Draft PR #1 não estiver homologado:

- não mesclar em `main`;
- não executar `wrangler deploy` sem `--env hml`;
- não trocar a versão ativa do Worker de produção;
- não alterar D1/R2 de produção;
- não modificar a política Allow do Access de produção.

## Rollback

Versão ativa registrada:

`1bfd75f2-f9c9-479c-8e91-de53767ea2db`

Versão anterior estável:

```powershell
npx wrangler rollback 8a0f607e-712f-4347-b48a-81a86142443a
```

Rollback do Worker não reverte D1.
