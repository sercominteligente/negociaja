# AGENTS.md

## Ordem de leitura

Antes de alterar o projeto, leia:

1. `AGENTS.md`
2. `docs/PROJECT_HANDOFF.md`
3. `docs/CLOUDFLARE.md`

## Regras de segurança

- Não recriar Worker, D1, R2, Access app ou domínios existentes.
- Não assumir que `main` representa exatamente a produção enquanto a recuperação estiver em andamento.
- Não aplicar migrations remotas sem listar pendentes e revisar o SQL.
- Não versionar tokens, cookies, credenciais OAuth ou API keys.
- Fazer mudanças Cloudflare primeiro em branch isolada e validar com dry-run.
- Exigir CI verde antes de merge ou deploy.
- Não publicar diretamente a branch de recuperação em produção sem homologação.
- Preservar rollback do Worker e lembrar que rollback não reverte D1.
- Não adicionar KV, Queues, Durable Objects, Vectorize, Workers AI ou AI Gateway sem caso de uso implementado.

## Arquitetura atual

Um único Cloudflare Worker com Static Assets, D1 e R2.

- `ASSETS` → `public/`
- `DB` → D1 `negocia-ja-bd`
- `FILES` → R2 `negocia-ja-files`

Landing pública em raiz/`www`; painel em `app.negociaja.com.br` protegido por Cloudflare Access. O Worker da branch de recuperação também valida o JWT do Access antes de servir painel/API em produção.

## Estado da recuperação

A recuperação está em `agent/recovery-foundation` e no Draft PR #1. O checkout local que produziu a versão ativa de 19/08/2026 foi perdido antes do push, então o `main` histórico não deve ser usado como snapshot exato de produção.

O CI da branch executa instalação, TypeScript, `node --check public/app.js` e `wrangler deploy --dry-run`, sem publicar.

## Validação mínima

Antes de propor merge/deploy:

```powershell
npm.cmd run check
npm.cmd run db:remote:list
```

Além disso, confirme CI verde e homologação comportamental. Se qualquer etapa falhar, não implantar.
