PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS integration_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  channel_type TEXT,
  conversation_id TEXT,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'processed',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, provider, external_event_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_integration_events_tenant_created ON integration_events(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integration_outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  destination TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  file_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_reference TEXT,
  last_error TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_status ON integration_outbox(status, created_at);
