-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

ALTER TABLE commerce_sessions ADD COLUMN customer_email TEXT;
ALTER TABLE commerce_sessions ADD COLUMN verified_at TEXT;

CREATE TABLE IF NOT EXISTS commerce_access_codes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  destination TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES commerce_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_commerce_access_codes_lookup ON commerce_access_codes(tenant_id,destination,expires_at DESC);

CREATE TABLE IF NOT EXISTS commerce_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  order_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES commerce_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_commerce_events_session ON commerce_events(tenant_id,session_id,created_at DESC);
