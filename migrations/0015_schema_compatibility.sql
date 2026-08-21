-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

-- `audit_logs` também nasceu em 0001. A definição mais nova de 0005 não
-- substitui uma tabela já existente, portanto adicionamos explicitamente os
-- campos usados pelo runtime autenticado.
ALTER TABLE audit_logs ADD COLUMN actor_role TEXT;
ALTER TABLE audit_logs ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

UPDATE audit_logs
SET metadata_json = COALESCE(NULLIF(payload_json,''),'{}')
WHERE metadata_json='{}' AND payload_json IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
ON audit_logs(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_created
ON audit_logs(action,created_at DESC);
