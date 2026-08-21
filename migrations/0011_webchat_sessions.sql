PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS webchat_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_webchat_tenant_expiry ON webchat_sessions(tenant_id,expires_at);
