PRAGMA foreign_keys = ON;

-- file_key already exists since 0005_tenant_personalization.sql.
-- This migration only adds binary-file metadata that did not exist before.
ALTER TABLE generated_documents ADD COLUMN file_size INTEGER;
ALTER TABLE generated_documents ADD COLUMN mime_type TEXT;
ALTER TABLE generated_documents ADD COLUMN pdf_generated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_generated_documents_file_key ON generated_documents(tenant_id,file_key);
