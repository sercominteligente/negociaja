# Auditoria D1 — NegocIAJá!

## Banco oficial de produção

- Worker: `negociaja`
- Binding: `DB`
- Database name: `negocia-ja-bd`
- Database ID: `25ad2242-5226-467d-9f69-bbdd244fb2ca`
- Diretório de migrations: `./migrations`
- Migration esperada no release atual: `0024_platform_testimonials.sql`

Não criar um segundo D1 para homologação ou produção sem decisão arquitetural explícita.

## Diagnóstico de 22/08/2026

O cadastro público apresentou incompatibilidade entre o runtime atual e o schema remoto.

### Compatibilidades identificadas

1. `tenant_settings.segment_label`
   - usada pelo cadastro atual;
   - criada por `0022_business_segment_label.sql`;
   - o runtime possui fallback temporário para schema anterior.

2. `audit_logs`
   - `0001_initial.sql` criou a tabela com `payload_json`;
   - `0005_auth_tenant_rbac.sql` usa uma definição mais nova, mas `CREATE TABLE IF NOT EXISTS` não altera a tabela já existente;
   - `0015_schema_compatibility.sql` adiciona `actor_role` e `metadata_json`;
   - o runtime aceita temporariamente os dois formatos para não bloquear cadastro e operações.

3. Migrations `0022_*` e `0023_*`
   - existem dois arquivos com cada prefixo;
   - o Wrangler registra migrations pelo nome completo e desempata prefixos iguais pelo nome;
   - NÃO renomear arquivos que possam já ter sido aplicados no D1 remoto.

## Auditoria remota segura

Executar primeiro:

```bash
npm run db:audit:remote
```

O comando é somente leitura. Ele verifica:

- migrations ainda não aplicadas;
- `PRAGMA quick_check`;
- tabelas, índices e triggers;
- histórico `d1_migrations`;
- schemas de `tenants`, `tenant_settings`, `users`, `platform_plans`, `tenant_subscriptions`, `email_verifications`, `notification_deliveries`, `audit_logs` e `auth_sessions`;
- contagens operacionais básicas.

Para listar somente migrations pendentes:

```bash
npm run db:status:remote
```

## Regra de segurança

Não executar `npm run db:remote` antes de comparar:

1. lista de migrations pendentes;
2. conteúdo de `d1_migrations`;
3. colunas que já existem no remoto.

Motivo: migrations com `ALTER TABLE ... ADD COLUMN` não são idempotentes se a coluna tiver sido criada manualmente mas o arquivo não estiver registrado em `d1_migrations`.

## Aplicação normal

Se o histórico remoto estiver coerente e as migrations pendentes realmente corresponderem a colunas/objetos ausentes:

```bash
npm run db:remote
```

Depois validar:

```bash
npm run db:audit:remote
```

E conferir:

```text
GET /api/health
```

O health check deve retornar `db.ready: true` e `latest_migration: 0024_platform_testimonials.sql`.

## Recuperação de drift

Se uma migration aparecer como pendente mas parte de suas alterações já existir no schema remoto:

- NÃO aplicar a fila inteira;
- comparar a migration com `PRAGMA table_info`;
- preparar reparo específico e idempotente;
- preservar dados existentes;
- somente depois reconciliar o histórico de migrations.

## Proteções adicionadas

- fallback para `segment_label` no signup;
- auditoria compatível com schema legado e atual;
- `/api/health` com prontidão do D1;
- `scripts/audit-d1-remote.mjs`;
- `.gitattributes` forçando LF em SQL/TS/JS/MJS para reduzir problemas de parsing de migrations com Wrangler.
