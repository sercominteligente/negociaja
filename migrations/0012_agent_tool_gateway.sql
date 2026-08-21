PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT,
  agent_profile_id TEXT,
  tool_name TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'read',
  status TEXT NOT NULL DEFAULT 'pending',
  arguments_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error_text TEXT,
  requested_by TEXT NOT NULL DEFAULT 'agent',
  approved_by_user_id TEXT,
  approved_at TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_tenant_status ON agent_tool_calls(tenant_id,status,created_at DESC);
