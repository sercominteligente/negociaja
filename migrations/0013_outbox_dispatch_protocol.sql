PRAGMA foreign_keys = ON;

ALTER TABLE action_delivery_outbox ADD COLUMN claim_token TEXT;
ALTER TABLE action_delivery_outbox ADD COLUMN claimed_at TEXT;
ALTER TABLE action_delivery_outbox ADD COLUMN last_attempt_at TEXT;

CREATE INDEX IF NOT EXISTS idx_action_outbox_claim ON action_delivery_outbox(tenant_id,claim_token);
CREATE INDEX IF NOT EXISTS idx_action_outbox_due ON action_delivery_outbox(status,next_attempt_at,created_at);
