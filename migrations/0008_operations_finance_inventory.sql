PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  qty REAL NOT NULL,
  balance_after REAL,
  reference_type TEXT,
  reference_id TEXT,
  note TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_item ON stock_movements(tenant_id,catalog_item_id,created_at DESC);

CREATE TABLE IF NOT EXISTS receivables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT,
  order_id TEXT,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  due_at TEXT,
  paid_at TEXT,
  payment_method TEXT,
  external_reference TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_receivables_tenant_status ON receivables(tenant_id,status,due_at);

CREATE TABLE IF NOT EXISTS payment_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  receivable_id TEXT,
  order_id TEXT,
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL,
  provider TEXT,
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  note TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (receivable_id) REFERENCES receivables(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_entries_tenant_created ON payment_entries(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS role_permission_profiles (
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id,role),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS onboarding_progress (
  tenant_id TEXT PRIMARY KEY,
  current_step TEXT NOT NULL DEFAULT 'company',
  company_done INTEGER NOT NULL DEFAULT 0,
  branding_done INTEGER NOT NULL DEFAULT 0,
  catalog_done INTEGER NOT NULL DEFAULT 0,
  team_done INTEGER NOT NULL DEFAULT 0,
  channel_done INTEGER NOT NULL DEFAULT 0,
  first_order_done INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO role_permission_profiles (tenant_id,role,permissions_json)
SELECT id,'manager','["dashboard.read","customers.read","customers.write","catalog.read","catalog.write","orders.read","orders.write","finance.read","documents.read","documents.write","conversations.read","conversations.write","reports.read"]' FROM tenants;
INSERT OR IGNORE INTO role_permission_profiles (tenant_id,role,permissions_json)
SELECT id,'operator','["dashboard.read","customers.read","catalog.read","orders.read","orders.create","orders.status","conversations.read","conversations.write","documents.read"]' FROM tenants;
INSERT OR IGNORE INTO role_permission_profiles (tenant_id,role,permissions_json)
SELECT id,'viewer','["dashboard.read","customers.read","catalog.read","orders.read","finance.read","documents.read","conversations.read","reports.read"]' FROM tenants;

INSERT OR IGNORE INTO onboarding_progress (tenant_id,company_done,branding_done,catalog_done,team_done,channel_done,first_order_done)
SELECT t.id,
  CASE WHEN bp.tenant_id IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN b.tenant_id IS NOT NULL THEN 1 ELSE 0 END,
  CASE WHEN EXISTS(SELECT 1 FROM catalog_items ci WHERE ci.tenant_id=t.id) THEN 1 ELSE 0 END,
  CASE WHEN EXISTS(SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id=t.id) THEN 1 ELSE 0 END,
  CASE WHEN EXISTS(SELECT 1 FROM channels ch WHERE ch.tenant_id=t.id) THEN 1 ELSE 0 END,
  CASE WHEN EXISTS(SELECT 1 FROM orders o WHERE o.tenant_id=t.id) THEN 1 ELSE 0 END
FROM tenants t
LEFT JOIN tenant_business_profile bp ON bp.tenant_id=t.id
LEFT JOIN tenant_branding b ON b.tenant_id=t.id;

CREATE TRIGGER IF NOT EXISTS trg_tenant_operations_defaults
AFTER INSERT ON tenants
BEGIN
  INSERT OR IGNORE INTO role_permission_profiles (tenant_id,role,permissions_json) VALUES
    (NEW.id,'manager','["dashboard.read","customers.read","customers.write","catalog.read","catalog.write","orders.read","orders.write","finance.read","documents.read","documents.write","conversations.read","conversations.write","reports.read"]'),
    (NEW.id,'operator','["dashboard.read","customers.read","catalog.read","orders.read","orders.create","orders.status","conversations.read","conversations.write","documents.read"]'),
    (NEW.id,'viewer','["dashboard.read","customers.read","catalog.read","orders.read","finance.read","documents.read","conversations.read","reports.read"]');
  INSERT OR IGNORE INTO onboarding_progress (tenant_id) VALUES (NEW.id);
END;
