PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS segment_templates (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  catalog_schema_json TEXT NOT NULL DEFAULT '{}',
  workflow_schema_json TEXT NOT NULL DEFAULT '{}',
  agent_schema_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'sales',
  system_prompt TEXT,
  model_provider TEXT,
  model_name TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  safety_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  mime_type TEXT,
  file_name TEXT,
  size_bytes INTEGER,
  transcript TEXT,
  analysis_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id TEXT,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  method TEXT,
  payment_url TEXT,
  pix_code TEXT,
  expires_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_status ON payment_intents(tenant_id, status);

CREATE TABLE IF NOT EXISTS event_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_jobs_status_schedule ON event_jobs(status, scheduled_at);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  label TEXT,
  postal_code TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  district TEXT,
  city TEXT,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'BR',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  file_key TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  audience_json TEXT NOT NULL DEFAULT '{}',
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  message_template TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO segment_templates (id, slug, name, description, icon, catalog_schema_json, workflow_schema_json, agent_schema_json) VALUES
('seg_retail','loja','Loja / Varejo','Produtos, variantes, estoque, pedidos e entrega.','shop','{"types":["product","bundle"],"stock":true}','{"steps":["new","confirmed","processing","ready","done"]}','{"goals":["sell","upsell","recover"]}'),
('seg_delivery','delivery','Restaurante / Delivery','Cardápio, adicionais, pedidos, produção e entrega.','food','{"types":["product","bundle"],"addons":true}','{"steps":["new","confirmed","processing","ready","delivery","done"]}','{"goals":["sell","upsell","reorder"]}'),
('seg_visual','comunicacao-visual','Comunicação Visual','Itens sob medida, cálculo, orçamento, aprovação e produção.','print','{"types":["product","service"],"dimensions":true}','{"steps":["quote","approved","art","production","finishing","installation","done"]}','{"goals":["quote","sell","followup"]}'),
('seg_service','servicos','Prestador de Serviços','Serviços, orçamento, agenda e execução.','tools','{"types":["service"],"schedule":true}','{"steps":["lead","quote","approved","scheduled","doing","done"]}','{"goals":["qualify","quote","schedule"]}'),
('seg_custom','personalizado','Personalizado','Monte catálogo, workflow e agente sob medida.','settings','{}','{}','{}');

INSERT OR IGNORE INTO agent_profiles
(id, tenant_id, name, role, capabilities_json, safety_json, active)
VALUES ('agent_demo','tenant_demo','NegocIA Assist','sales',
'["catalog.search","order.create","order.status","customer.lookup","human.takeover","payment.prepare"]',
'{"require_human_for":["refund","high_discount","sensitive_data","bulk_message"]}',1);
