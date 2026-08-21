PRAGMA foreign_keys = ON;

-- Public signup and email verification support.
ALTER TABLE users ADD COLUMN email_verified_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email_global ON users(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token_purpose ON email_verifications(token_hash, purpose, expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_template ON notification_deliveries(tenant_id, template_key, created_at);
