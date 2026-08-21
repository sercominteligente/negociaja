-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

-- `conversations` já existe desde 0001. Evoluímos a tabela existente em vez
-- de tentar recriá-la com CREATE TABLE IF NOT EXISTS, que não altera schema.
ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'webchat';
ALTER TABLE conversations ADD COLUMN external_thread_id TEXT;
ALTER TABLE conversations ADD COLUMN customer_name TEXT;
ALTER TABLE conversations ADD COLUMN customer_address TEXT;
ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE conversations ADD COLUMN updated_at TEXT;

-- Preserva dados da primeira versão.
UPDATE conversations
SET mode = CASE WHEN status IN ('ai','human') THEN status ELSE 'ai' END;

UPDATE conversations
SET status = 'open'
WHERE status IN ('ai','human') OR status IS NULL OR status = '';

UPDATE conversations
SET external_thread_id = COALESCE(external_thread_id, external_id),
    channel = COALESCE(
      NULLIF(channel,''),
      (SELECT ch.channel_type FROM channels ch WHERE ch.id = conversations.channel_id),
      'webchat'
    ),
    customer_name = COALESCE(
      customer_name,
      (SELECT c.name FROM customers c WHERE c.id = conversations.customer_id)
    ),
    customer_address = COALESCE(
      customer_address,
      (SELECT c.phone FROM customers c WHERE c.id = conversations.customer_id)
    ),
    updated_at = COALESCE(updated_at,last_message_at,created_at,datetime('now'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_external
ON conversations(tenant_id,channel,external_thread_id)
WHERE external_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_inbox
ON conversations(tenant_id,status,last_message_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_id TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  text_content TEXT,
  media_key TEXT,
  external_message_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
ON conversation_messages(tenant_id,conversation_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external
ON conversation_messages(tenant_id,external_message_id)
WHERE external_message_id IS NOT NULL;

-- Copia mensagens da primeira versão para o novo modelo sem apagar o legado.
INSERT OR IGNORE INTO conversation_messages
(id,tenant_id,conversation_id,direction,sender_type,message_type,text_content,media_key,metadata_json,created_at)
SELECT m.id,c.tenant_id,m.conversation_id,m.direction,m.sender_type,
       COALESCE(NULLIF(m.content_type,''),'text'),m.body,m.file_key,
       COALESCE(NULLIF(m.metadata_json,''),'{}'),m.created_at
FROM messages m
JOIN conversations c ON c.id=m.conversation_id;

CREATE TABLE IF NOT EXISTS conversation_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conversation_events
ON conversation_events(tenant_id,conversation_id,created_at);
