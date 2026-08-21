-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

ALTER TABLE tenant_subscriptions ADD COLUMN provider_status TEXT;
ALTER TABLE tenant_subscriptions ADD COLUMN checkout_url TEXT;
ALTER TABLE tenant_subscriptions ADD COLUMN provider_metadata_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_expiry
ON tenant_subscriptions(status,trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_expiry
ON tenant_subscriptions(status,current_period_end);

-- Permite idempotência e correlação de checkout sem expor ids internos ao provider.
CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  external_reference TEXT NOT NULL UNIQUE,
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  checkout_url TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES platform_plans(id)
);
CREATE INDEX IF NOT EXISTS idx_checkout_tenant_status ON billing_checkout_sessions(tenant_id,status,created_at DESC);
