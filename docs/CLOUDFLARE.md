# Cloudflare — operação do NegocIAJá

## Princípio

A configuração declarada em `wrangler.jsonc` deve ser tratada como fonte de verdade do Worker. Não recrie recursos existentes para corrigir bindings ou falhas de build.

## Recursos existentes

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

## Static Assets e autenticação

`assets.run_worker_first` deve permanecer `true`.

Sem essa opção, o comportamento padrão de Static Assets é servir arquivos existentes antes de executar o Worker. Como o mesmo diretório contém landing e painel, isso poderia contornar a validação interna do Access em arquivos como `app.html`. Com `run_worker_first: true`, todas as requisições passam primeiro pelo roteamento e pelos controles de segurança do Worker; o Worker então usa `env.ASSETS.fetch()` apenas quando a requisição já foi classificada/autorizada.

## Antes de qualquer deploy

1. Confirme que está na branch correta.
2. Rode `npm.cmd install` apenas quando necessário.
3. Rode `npm.cmd run check`.
4. Confirme que o GitHub Actions CI está verde.
5. Rode `npm.cmd run db:remote:list` e confirme que não há migration inesperada.
6. Não aplique migration automaticamente junto com deploy.
7. Confirme que D1 e R2 apontam para os IDs/nomes acima.
8. Preserve a versão anterior para rollback.

## Banco D1

Migrations já aplicadas:

- `0001_initial.sql`
- `0002_seed_demo.sql`
- `0003_platform_core.sql`

Nunca recriar o banco para resolver erro de migration. Antes de nova migration, faça export remoto e liste pendentes.

## Deploy

```powershell
npm.cmd run check
npm.cmd run deploy
```

O deploy deve acontecer somente quando a branch validada representar corretamente a produção desejada.

## Workers Builds

O código de produção foi publicado manualmente por Wrangler em 19/08/2026, mas o checkout local que continha essa versão foi perdido antes do push. Por isso, o `main` histórico pode estar atrás da versão ativa. Não use falha/sucesso do build automático como autorização para substituir a produção até a recuperação ser concluída.

### Causas concretas encontradas em 19/08/2026

O repositório apontava para `@cloudflare/workers-types@^4.20260818.0`, versão inexistente no npm. A instalação falhava antes mesmo de TypeScript ou Wrangler serem executados.

Ao fixar Workers Types v5 com o Wrangler histórico 4.31.0, o npm também revelou conflito de peer dependency. Em vez de usar `--force` ou `--legacy-peer-deps`, a branch foi alinhada a versões publicadas e compatíveis que passaram no CI:

- `jose`: `6.2.8`
- `@cloudflare/workers-types`: `5.20260813.1`
- `typescript`: `5.9.2`
- `wrangler`: `4.123.0`

Após o alinhamento, o GitHub Actions concluiu com sucesso:

- instalação das dependências;
- `tsc --noEmit`;
- `node --check public/app.js`;
- `wrangler deploy --dry-run`.

Esse CI não publica o Worker.

## Access

O painel em `app.negociaja.com.br` deve permanecer atrás do Cloudflare Access. O Worker da branch de recuperação também valida criptograficamente o header `Cf-Access-Jwt-Assertion` com JWKS, issuer e AUD.

Não altere a política Allow durante mudanças visuais da página de login.

Branding planejado:

- Logo: `https://negociaja.com.br/brand/logo-primary.png`
- Fundo: `#F7FAFF`
- Texto: `#071A43`
- Cabeçalho: `Bem-vindo ao NegocIAJá!`
- Rodapé: `Atendimento, vendas e operação em um único fluxo.`

## Gate antes de produção

Enquanto o Draft PR #1 não estiver homologado:

- não mesclar em `main`;
- não executar `wrangler deploy` contra produção;
- não trocar a versão ativa do Worker;
- não alterar D1/R2;
- não modificar a política Allow do Access.

## Rollback

Versão ativa registrada no handoff perdido:

`1bfd75f2-f9c9-479c-8e91-de53767ea2db`

Versão anterior estável registrada:

```powershell
npx wrangler rollback 8a0f607e-712f-4347-b48a-81a86142443a
```

Rollback do Worker não reverte alterações do D1.
