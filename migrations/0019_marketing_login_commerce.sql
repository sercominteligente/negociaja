-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

ALTER TABLE tenant_settings ADD COLUMN login_background_key TEXT;
ALTER TABLE tenant_settings ADD COLUMN login_headline TEXT;
ALTER TABLE tenant_settings ADD COLUMN login_message TEXT;
ALTER TABLE tenant_settings ADD COLUMN login_button_label TEXT;
ALTER TABLE tenant_settings ADD COLUMN storefront_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tenant_settings ADD COLUMN storefront_headline TEXT;
ALTER TABLE tenant_settings ADD COLUMN storefront_message TEXT;

CREATE TABLE IF NOT EXISTS platform_marketing (
  id TEXT PRIMARY KEY CHECK(id='default'),
  logo_full_key TEXT,
  logo_icon_key TEXT,
  hero_video_key TEXT,
  hero_video_poster_key TEXT,
  hero_kicker TEXT NOT NULL DEFAULT 'ATENDIMENTO + VENDAS + OPERAÇÃO',
  hero_title TEXT NOT NULL DEFAULT 'Quer vender +?',
  hero_subtitle TEXT NOT NULL DEFAULT 'Transforme conversas em pedidos, pedidos em relacionamento e relacionamento em novas vendas.',
  video_title TEXT NOT NULL DEFAULT 'Conheça o NegocIAJá!',
  video_description TEXT NOT NULL DEFAULT 'Veja como atendimento, vendas, operação e inteligência trabalham juntos.',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO platform_marketing(id) VALUES('default');

CREATE TABLE IF NOT EXISTS commerce_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  customer_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_commerce_sessions_tenant ON commerce_sessions(tenant_id,status,expires_at);

CREATE TABLE IF NOT EXISTS commerce_carts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES commerce_sessions(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_open_session ON commerce_carts(session_id) WHERE status='open';

CREATE TABLE IF NOT EXISTS commerce_cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(cart_id,catalog_item_id),
  FOREIGN KEY (cart_id) REFERENCES commerce_carts(id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS commerce_order_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id,order_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES commerce_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_commerce_order_links_session ON commerce_order_links(session_id,created_at DESC);
