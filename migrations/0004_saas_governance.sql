PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platform_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  global_role TEXT NOT NULL DEFAULT 'member' CHECK(global_role IN ('super_admin','support','member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked','invited')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK(role IN ('owner','admin','manager','operator','viewer')),
  permissions_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked','invited')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, platform_user_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_status ON tenant_memberships(platform_user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_role ON tenant_memberships(tenant_id, role, status);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  price_yearly_cents INTEGER NOT NULL DEFAULT 0,
  limits_json TEXT NOT NULL DEFAULT '{}',
  features_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'trialing' CHECK(status IN ('trialing','active','past_due','suspended','cancelled')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  trial_ends_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  cancelled_at TEXT,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT,
  provider TEXT,
  model TEXT,
  modality TEXT NOT NULL DEFAULT 'text',
  input_units INTEGER NOT NULL DEFAULT 0,
  output_units INTEGER NOT NULL DEFAULT 0,
  estimated_cost_micros INTEGER NOT NULL DEFAULT 0,
  external_request_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agent_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_created ON ai_usage_events(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_billing_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  subscription_id TEXT,
  event_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_reference TEXT,
  due_at TEXT,
  paid_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES tenant_subscriptions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS integration_health_checks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  integration_id TEXT,
  channel_id TEXT,
  component TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK(status IN ('healthy','degraded','down','unknown')),
  latency_ms INTEGER,
  message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_health_tenant_checked ON integration_health_checks(tenant_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS global_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY,
  flag_key TEXT NOT NULL UNIQUE,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  rollout_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO plans (id, slug, name, description, price_monthly_cents, limits_json, features_json) VALUES
('plan_hml','homologacao','Homologação','Plano interno para testes do NegocIAJá.',0,'{"users":20,"channels":5,"agents":10,"ai_monthly_units":1000000}','["whatsapp","telegram","multimodal","orders","catalog","automation","reports"]'),
('plan_start','start','Start','Atendimento e vendas para operações pequenas.',9900,'{"users":3,"channels":1,"agents":1,"ai_monthly_units":100000}','["whatsapp","catalog","orders","ai"]'),
('plan_growth','growth','Growth','Operação multicanal com automações e equipe.',24900,'{"users":10,"channels":3,"agents":5,"ai_monthly_units":500000}','["whatsapp","telegram","multimodal","automation","reports","integrations"]');

INSERT OR IGNORE INTO tenant_subscriptions (id, tenant_id, plan_id, status, trial_ends_at)
VALUES ('sub_demo','tenant_demo','plan_hml','active',datetime('now','+30 day'));

INSERT OR IGNORE INTO platform_users (id, email, name, global_role, status)
VALUES ('puser_hml_admin','local@negociaja.invalid','Super Admin HML','super_admin','active');

INSERT OR IGNORE INTO tenant_memberships (id, tenant_id, platform_user_id, role, permissions_json, status)
VALUES ('membership_hml_admin','tenant_demo','puser_hml_admin','owner','["*"]','active');

INSERT OR IGNORE INTO global_settings (setting_key, value_json, updated_by)
VALUES ('platform.brand','{"name":"NegocIAJá!","slogan":"Quer vender +? NegocIAJá!"}','system');
