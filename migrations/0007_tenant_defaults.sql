PRAGMA foreign_keys = ON;

-- Backfill safe defaults for tenants created before automated onboarding defaults.
INSERT OR IGNORE INTO tenant_business_profile (tenant_id, country)
SELECT id, 'BR' FROM tenants;

INSERT OR IGNORE INTO tenant_branding
(tenant_id, primary_color, secondary_color, accent_color, background_color, text_color, border_radius, show_negociaja_brand)
SELECT id, '#169CFF', '#0B2B7C', '#FFC107', '#FFFFFF', '#071A43', '14px', 1 FROM tenants;

INSERT OR IGNORE INTO catalog_presentation
(tenant_id, layout, show_prices, show_stock, show_categories, card_style)
SELECT id, 'grid', 1, 0, 1, 'default' FROM tenants;

INSERT OR IGNORE INTO tenant_portal_settings (tenant_id, support_label)
SELECT id, 'Ajuda IA' FROM tenants;

INSERT OR IGNORE INTO document_numbering (tenant_id, document_type, prefix, next_number, padding, reset_policy)
SELECT id, 'quote', 'ORC-', 1, 5, 'never' FROM tenants;
INSERT OR IGNORE INTO document_numbering (tenant_id, document_type, prefix, next_number, padding, reset_policy)
SELECT id, 'order', 'PED-', 1, 5, 'never' FROM tenants;
INSERT OR IGNORE INTO document_numbering (tenant_id, document_type, prefix, next_number, padding, reset_policy)
SELECT id, 'receipt', 'REC-', 1, 5, 'never' FROM tenants;
INSERT OR IGNORE INTO document_numbering (tenant_id, document_type, prefix, next_number, padding, reset_policy)
SELECT id, 'invoice', 'FAT-', 1, 5, 'never' FROM tenants;

-- Every future tenant receives the same minimal white-label/document scaffold immediately.
CREATE TRIGGER IF NOT EXISTS trg_tenant_defaults_after_insert
AFTER INSERT ON tenants
BEGIN
  INSERT OR IGNORE INTO tenant_business_profile (tenant_id, country) VALUES (NEW.id, 'BR');
  INSERT OR IGNORE INTO tenant_branding
    (tenant_id, primary_color, secondary_color, accent_color, background_color, text_color, border_radius, show_negociaja_brand)
    VALUES (NEW.id, '#169CFF', '#0B2B7C', '#FFC107', '#FFFFFF', '#071A43', '14px', 1);
  INSERT OR IGNORE INTO catalog_presentation
    (tenant_id, layout, show_prices, show_stock, show_categories, card_style)
    VALUES (NEW.id, 'grid', 1, 0, 1, 'default');
  INSERT OR IGNORE INTO tenant_portal_settings (tenant_id, support_label) VALUES (NEW.id, 'Ajuda IA');
  INSERT OR IGNORE INTO document_numbering (tenant_id, document_type, prefix, next_number, padding, reset_policy) VALUES (NEW.id, 'quote', 'ORC-', 1, 5, 'never');
  INSERT OR IGNORE INTO document_numbering (tenant_id, document_type, prefix, next_number, padding, reset_policy) VALUES (NEW.id, 'order', 'PED-', 1, 5, 'never');
  INSERT OR IGNORE INTO document_numbering (tenant_id, document_type, prefix, next_number, padding, reset_policy) VALUES (NEW.id, 'receipt', 'REC-', 1, 5, 'never');
  INSERT OR IGNORE INTO document_numbering (tenant_id, document_type, prefix, next_number, padding, reset_policy) VALUES (NEW.id, 'invoice', 'FAT-', 1, 5, 'never');
END;
