PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenant_branding (
  tenant_id TEXT PRIMARY KEY,
  logo_key TEXT,
  logo_dark_key TEXT,
  favicon_key TEXT,
  primary_color TEXT NOT NULL DEFAULT '#169CFF',
  secondary_color TEXT NOT NULL DEFAULT '#0B2B7C',
  accent_color TEXT NOT NULL DEFAULT '#FFC107',
  background_color TEXT NOT NULL DEFAULT '#FFFFFF',
  text_color TEXT NOT NULL DEFAULT '#071A43',
  font_family TEXT,
  border_radius TEXT NOT NULL DEFAULT '14px',
  company_display_name TEXT,
  slogan TEXT,
  footer_text TEXT,
  show_negociaja_brand INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_presentation (
  tenant_id TEXT PRIMARY KEY,
  layout TEXT NOT NULL DEFAULT 'grid',
  hero_image_key TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  show_prices INTEGER NOT NULL DEFAULT 1,
  show_stock INTEGER NOT NULL DEFAULT 0,
  show_categories INTEGER NOT NULL DEFAULT 1,
  card_style TEXT NOT NULL DEFAULT 'default',
  catalog_title TEXT,
  catalog_description TEXT,
  custom_domain TEXT,
  seo_json TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_business_profile (
  tenant_id TEXT PRIMARY KEY,
  legal_name TEXT,
  trade_name TEXT,
  document_number TEXT,
  state_registration TEXT,
  municipal_registration TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  website TEXT,
  postal_code TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  district TEXT,
  city TEXT,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'BR',
  bank_info_json TEXT NOT NULL DEFAULT '{}',
  payment_instructions TEXT,
  terms_text TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  show_logo INTEGER NOT NULL DEFAULT 1,
  show_company_data INTEGER NOT NULL DEFAULT 1,
  show_customer_data INTEGER NOT NULL DEFAULT 1,
  show_signature INTEGER NOT NULL DEFAULT 0,
  show_payment_terms INTEGER NOT NULL DEFAULT 1,
  header_json TEXT NOT NULL DEFAULT '{}',
  body_json TEXT NOT NULL DEFAULT '{}',
  footer_json TEXT NOT NULL DEFAULT '{}',
  style_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(tenant_id, document_type, name)
);
CREATE INDEX IF NOT EXISTS idx_document_templates_tenant_type ON document_templates(tenant_id, document_type, active);

CREATE TABLE IF NOT EXISTS document_numbering (
  tenant_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  prefix TEXT,
  suffix TEXT,
  next_number INTEGER NOT NULL DEFAULT 1,
  padding INTEGER NOT NULL DEFAULT 5,
  reset_policy TEXT NOT NULL DEFAULT 'never',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, document_type),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS generated_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_number TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  template_id TEXT,
  file_key TEXT,
  status TEXT NOT NULL DEFAULT 'generated',
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES document_templates(id) ON DELETE SET NULL,
  UNIQUE(tenant_id, document_type, document_number)
);

CREATE TABLE IF NOT EXISTS tenant_portal_settings (
  tenant_id TEXT PRIMARY KEY,
  dashboard_welcome_title TEXT,
  dashboard_welcome_text TEXT,
  login_background_key TEXT,
  login_message TEXT,
  support_label TEXT NOT NULL DEFAULT 'Ajuda IA',
  modules_json TEXT NOT NULL DEFAULT '{}',
  navigation_json TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO document_numbering (tenant_id, document_type, prefix, next_number, padding)
VALUES
('tenant_demo','order','PED-',1,5),
('tenant_demo','receipt','REC-',1,5),
('tenant_demo','quote','ORC-',1,5),
('tenant_demo','invoice','FAT-',1,5);
