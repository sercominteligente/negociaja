PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS assistant_action_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  requested_by TEXT,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  risk_level TEXT NOT NULL DEFAULT 'medium',
  payload_json TEXT NOT NULL DEFAULT '{}',
  reviewed_by TEXT,
  reviewed_at TEXT,
  executed_at TEXT,
  execution_result_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_actions_tenant_status ON assistant_action_requests(tenant_id,status,created_at DESC);
