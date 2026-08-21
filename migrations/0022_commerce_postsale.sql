-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

ALTER TABLE workflow_steps ADD COLUMN is_terminal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_steps ADD COLUMN post_sale_eligible INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS commerce_feedback (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id,session_id,order_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES commerce_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_commerce_feedback_tenant ON commerce_feedback(tenant_id,created_at DESC);

UPDATE workflow_steps
SET is_terminal=1, post_sale_eligible=1
WHERE id IN (
  SELECT ws.id FROM workflow_steps ws
  JOIN (
    SELECT workflow_id,MAX(sort_order) max_sort FROM workflow_steps GROUP BY workflow_id
  ) last_step ON last_step.workflow_id=ws.workflow_id AND last_step.max_sort=ws.sort_order
);
