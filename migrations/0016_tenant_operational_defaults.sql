-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

-- Corrige tenants já existentes que não receberam estrutura operacional.
INSERT INTO workflow_templates (id,tenant_id,name,transaction_type,is_default)
SELECT 'wf_default_'||t.id,t.id,'Fluxo padrão de venda','order',1
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM workflow_templates w WHERE w.tenant_id=t.id);

INSERT OR IGNORE INTO workflow_steps (id,workflow_id,step_key,label,sort_order,color,customer_message)
SELECT 'step_new_'||w.tenant_id,w.id,'new','Novo',1,'#169CFF','Recebemos seu pedido.'
FROM workflow_templates w WHERE w.is_default=1
UNION ALL
SELECT 'step_confirmed_'||w.tenant_id,w.id,'confirmed','Confirmado',2,'#25D9FF','Seu pedido foi confirmado.'
FROM workflow_templates w WHERE w.is_default=1
UNION ALL
SELECT 'step_processing_'||w.tenant_id,w.id,'processing','Em andamento',3,'#FFC107','Seu pedido está em andamento.'
FROM workflow_templates w WHERE w.is_default=1
UNION ALL
SELECT 'step_ready_'||w.tenant_id,w.id,'ready','Pronto',4,'#FF9800','Seu pedido está pronto.'
FROM workflow_templates w WHERE w.is_default=1
UNION ALL
SELECT 'step_done_'||w.tenant_id,w.id,'done','Concluído',5,'#0B2B7C','Pedido concluído. Obrigado!'
FROM workflow_templates w WHERE w.is_default=1;

INSERT INTO agent_profiles (id,tenant_id,name,role,capabilities_json,safety_json,active)
SELECT 'agent_default_'||t.id,t.id,'NegocIA Assist','sales',
       '["catalog.search","customer.lookup","order.lookup","order.prepare","order.create","order.status.change"]',
       '{"require_human_for":["order.create","order.status.change","refund","high_discount","sensitive_data","bulk_message"]}',1
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM agent_profiles a WHERE a.tenant_id=t.id AND a.active=1);

-- Garante os mesmos defaults para qualquer tenant criado daqui em diante.
CREATE TRIGGER IF NOT EXISTS trg_tenant_operational_defaults
AFTER INSERT ON tenants
BEGIN
  INSERT OR IGNORE INTO workflow_templates (id,tenant_id,name,transaction_type,is_default)
  VALUES ('wf_default_'||NEW.id,NEW.id,'Fluxo padrão de venda','order',1);

  INSERT OR IGNORE INTO workflow_steps (id,workflow_id,step_key,label,sort_order,color,customer_message) VALUES
  ('step_new_'||NEW.id,'wf_default_'||NEW.id,'new','Novo',1,'#169CFF','Recebemos seu pedido.'),
  ('step_confirmed_'||NEW.id,'wf_default_'||NEW.id,'confirmed','Confirmado',2,'#25D9FF','Seu pedido foi confirmado.'),
  ('step_processing_'||NEW.id,'wf_default_'||NEW.id,'processing','Em andamento',3,'#FFC107','Seu pedido está em andamento.'),
  ('step_ready_'||NEW.id,'wf_default_'||NEW.id,'ready','Pronto',4,'#FF9800','Seu pedido está pronto.'),
  ('step_done_'||NEW.id,'wf_default_'||NEW.id,'done','Concluído',5,'#0B2B7C','Pedido concluído. Obrigado!');

  INSERT OR IGNORE INTO agent_profiles (id,tenant_id,name,role,capabilities_json,safety_json,active)
  VALUES ('agent_default_'||NEW.id,NEW.id,'NegocIA Assist','sales',
          '["catalog.search","customer.lookup","order.lookup","order.prepare","order.create","order.status.change"]',
          '{"require_human_for":["order.create","order.status.change","refund","high_discount","sensitive_data","bulk_message"]}',1);
END;
