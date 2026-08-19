# NegocIAJá!

Plataforma SaaS multissegmento para atendimento, catálogo, pedidos, vendas, automações e operação.

## Estado atual

A produção está ativa no Cloudflare, mas o checkout local que gerou a versão publicada em 19/08/2026 foi perdido antes do push. A recuperação está isolada na branch `agent/recovery-foundation` e no Draft PR #1.

Antes de alterar, mesclar ou publicar, leia:

- `AGENTS.md`
- `docs/PROJECT_HANDOFF.md`
- `docs/CLOUDFLARE.md`

Validação segura:

```bash
npm install
npm run check
```

Não recrie Worker, D1, R2, Access ou domínios para corrigir build/configuração.
