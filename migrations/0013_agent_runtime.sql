PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  agent_profile_id TEXT,
  provider TEXT NOT NULL DEFAULT 'openai',
  model_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  input_message_id TEXT,
  output_message_id TEXT,
  tool_calls_json TEXT NOT NULL DEFAULT '[]',
  error_text TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation ON agent_runs(tenant_id,conversation_id,started_at DESC);
