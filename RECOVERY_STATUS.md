# Recovery status

Branch: `agent/recovery-foundation`

## Restored in GitHub

- Wrangler bindings for existing D1/R2 and public environment identifiers.
- Validation scripts (`types`, `db:remote:list`, `check`).
- Project handoff and Cloudflare operations documentation.
- Repository safety rules.

## Not yet reconstructed

The exact Worker source that generated production version `1bfd75f2-f9c9-479c-8e91-de53767ea2db` was lost locally before being pushed. In particular, the stronger Cloudflare Access/JWT and request-hardening code described in the handoff still needs to be rebuilt and reviewed in this branch before any merge to `main`.

## Production safety

Do not deploy this recovery branch yet. The active production Worker must remain untouched until the recovered source passes local/dry-run checks and the security delta from the historical `main` is closed.
