-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

ALTER TABLE commerce_outreach_log ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE commerce_outreach_log ADD COLUMN last_error TEXT;
ALTER TABLE commerce_outreach_log ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
CREATE INDEX IF NOT EXISTS idx_commerce_outreach_status ON commerce_outreach_log(tenant_id,status,updated_at DESC);
