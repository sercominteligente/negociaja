PRAGMA foreign_keys = ON;

ALTER TABLE generated_documents ADD COLUMN file_key TEXT;
ALTER TABLE generated_documents ADD COLUMN file_size INTEGER;
ALTER TABLE generated_documents ADD COLUMN mime_type TEXT;
ALTER TABLE generated_documents ADD COLUMN pdf_generated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_generated_documents_file_key ON generated_documents(tenant_id,file_key);
