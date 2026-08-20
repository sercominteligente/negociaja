PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  scope_key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (scope_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_updated ON rate_limit_windows(updated_at);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_by TEXT,
  export_key TEXT,
  export_size INTEGER,
  execute_after TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_tenant_status ON privacy_requests(tenant_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_retention_policies (
  tenant_id TEXT PRIMARY KEY,
  audit_days INTEGER NOT NULL DEFAULT 365,
  conversation_days INTEGER NOT NULL DEFAULT 365,
  notification_days INTEGER NOT NULL DEFAULT 180,
  failed_delivery_days INTEGER NOT NULL DEFAULT 90,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO tenant_retention_policies (tenant_id)
SELECT id FROM tenants;
