PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS action_delivery_outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  action_request_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  destination TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  provider_reference TEXT,
  next_attempt_at TEXT,
  dispatched_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(action_request_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (action_request_id) REFERENCES assistant_action_requests(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_action_outbox_tenant_status ON action_delivery_outbox(tenant_id,status,created_at ASC);
