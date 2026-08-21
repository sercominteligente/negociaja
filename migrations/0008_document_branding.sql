PRAGMA foreign_keys = ON;

ALTER TABLE tenant_settings ADD COLUMN document_footer TEXT;
ALTER TABLE tenant_settings ADD COLUMN document_notes TEXT;
ALTER TABLE tenant_settings ADD COLUMN access_headline TEXT;
ALTER TABLE tenant_settings ADD COLUMN access_message TEXT;
ALTER TABLE tenant_settings ADD COLUMN access_show_brand INTEGER NOT NULL DEFAULT 1;
