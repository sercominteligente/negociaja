PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS channel_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  channel TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  webhook_token_hash TEXT NOT NULL,
  api_base_url TEXT,
  api_key_ciphertext TEXT,
  api_key_iv TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id,provider,instance_name),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_channel_connections_lookup ON channel_connections(provider,instance_name,status);
