PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS integration_health_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  provider TEXT NOT NULL,
  component TEXT,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_integration_health_provider_time ON integration_health_events(provider,observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_health_tenant_provider ON integration_health_events(tenant_id,provider,observed_at DESC);
