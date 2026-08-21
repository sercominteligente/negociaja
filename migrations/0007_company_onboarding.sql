PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenant_onboarding (
  tenant_id TEXT PRIMARY KEY,
  current_step INTEGER NOT NULL DEFAULT 1,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  company_json TEXT NOT NULL DEFAULT '{}',
  operations_json TEXT NOT NULL DEFAULT '{}',
  channels_json TEXT NOT NULL DEFAULT '{}',
  branding_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

ALTER TABLE tenant_settings ADD COLUMN legal_name TEXT;
ALTER TABLE tenant_settings ADD COLUMN document TEXT;
ALTER TABLE tenant_settings ADD COLUMN email TEXT;
ALTER TABLE tenant_settings ADD COLUMN phone TEXT;
ALTER TABLE tenant_settings ADD COLUMN logo_key TEXT;
ALTER TABLE tenant_settings ADD COLUMN secondary_color TEXT DEFAULT '#0B2B7C';

CREATE INDEX IF NOT EXISTS idx_onboarding_completed ON tenant_onboarding(completed, updated_at);
