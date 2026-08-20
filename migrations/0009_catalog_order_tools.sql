PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS catalog_variants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL,
  sku TEXT,
  name TEXT NOT NULL,
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  stock_control INTEGER NOT NULL DEFAULT 0,
  stock_qty REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE,
  UNIQUE(tenant_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_catalog_variants_item ON catalog_variants(tenant_id,catalog_item_id,active);

CREATE TABLE IF NOT EXISTS order_cancellations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  refund_required INTEGER NOT NULL DEFAULT 0,
  refund_status TEXT NOT NULL DEFAULT 'not_required',
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_single_cancellation ON order_cancellations(tenant_id,order_id);

CREATE TABLE IF NOT EXISTS assistant_tool_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT,
  tool_name TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_assistant_tool_events_tenant ON assistant_tool_events(tenant_id,created_at DESC);
