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
- Preservar rollback do Worker e lembrar que rollback não reverte D1.
- Não adicionar KV, Queues, Durable Objects, Vectorize, Workers AI ou AI Gateway sem caso de uso implementado.

## Arquitetura atual

Um único Cloudflare Worker com Static Assets, D1 e R2.

- `ASSETS` → `public/`
- `DB` → D1 `negocia-ja-bd`
- `FILES` → R2 `negocia-ja-files`

Landing pública em raiz/`www`; painel em `app.negociaja.com.br` protegido por Cloudflare Access.

## Validação mínima

Antes de propor merge/deploy:

```powershell
npm.cmd run check
npm.cmd run db:remote:list
```

Se qualquer comando falhar, não implantar.
