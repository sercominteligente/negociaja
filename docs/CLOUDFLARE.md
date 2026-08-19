# Cloudflare — operação do NegocIAJá

## Princípio

A configuração declarada em `wrangler.jsonc` deve ser tratada como fonte de verdade do Worker. Não recrie recursos existentes para corrigir bindings.

## Recursos existentes

- Worker: `negociaja`
- D1 binding `DB` → `negocia-ja-bd` (`25ad2242-5226-467d-9f69-bbdd244fb2ca`)
- R2 binding `FILES` → `negocia-ja-files`
- Static Assets binding `ASSETS` → `public/`
- Domínios: `negociaja.com.br`, `www.negociaja.com.br`, `app.negociaja.com.br`
- Access app: `NegocIAJá — Painel`
- Access AUD: `f10e7d76c9531823e695b17cb3c938b5ff6584e68663ec2e65a820d3be85e218`
- Team domain: `https://bitter-cell-31bf.cloudflareaccess.com`

## Antes de qualquer deploy

1. Confirme que está na branch correta.
2. Rode `npm.cmd run check`.
3. Rode `npm.cmd run db:remote:list` e confirme que não há migration inesperada.
4. Não aplique migration automaticamente junto com deploy.
5. Confirme que D1 e R2 apontam para os IDs/nomes acima.
6. Preserve a versão anterior para rollback.

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

## Access

O painel em `app.negociaja.com.br` deve permanecer atrás do Cloudflare Access. Não altere a política Allow durante mudanças visuais da página de login.

Branding planejado:

- Logo: `https://negociaja.com.br/brand/logo-primary.png`
- Fundo: `#F7FAFF`
- Texto: `#071A43`
- Cabeçalho: `Bem-vindo ao NegocIAJá!`
- Rodapé: `Atendimento, vendas e operação em um único fluxo.`

## Rollback

Versão anterior estável registrada:

```powershell
npx wrangler rollback 8a0f607e-712f-4347-b48a-81a86142443a
```

Rollback do Worker não reverte alterações do D1.
