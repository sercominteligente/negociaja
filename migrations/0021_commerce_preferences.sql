-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS commerce_preferences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  email_updates INTEGER NOT NULL DEFAULT 0,
  whatsapp_updates INTEGER NOT NULL DEFAULT 0,
  marketing_email INTEGER NOT NULL DEFAULT 0,
  marketing_whatsapp INTEGER NOT NULL DEFAULT 0,
  consent_source TEXT,
  consented_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id,session_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES commerce_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_commerce_preferences_tenant ON commerce_preferences(tenant_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS commerce_outreach_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  outreach_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES commerce_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_commerce_outreach_frequency ON commerce_outreach_log(tenant_id,session_id,outreach_type,created_at DESC);
