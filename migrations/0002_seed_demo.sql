INSERT OR IGNORE INTO tenants (id, slug, name, segment) VALUES
('tenant_demo', 'demo', 'NegocIAJá Demo', 'retail');

INSERT OR IGNORE INTO tenant_settings (tenant_id, public_name, whatsapp, catalog_mode, order_mode) VALUES
('tenant_demo', 'Loja Demo NegocIAJá', '5585999999999', 'products_services', 'order');

INSERT OR IGNORE INTO workflow_templates (id, tenant_id, name, transaction_type, is_default) VALUES
('wf_demo', 'tenant_demo', 'Fluxo padrão de venda', 'order', 1);

INSERT OR IGNORE INTO workflow_steps (id, workflow_id, step_key, label, sort_order, color, customer_message) VALUES
('step_new', 'wf_demo', 'new', 'Novo', 1, '#169CFF', 'Recebemos seu pedido.'),
('step_confirmed', 'wf_demo', 'confirmed', 'Confirmado', 2, '#25D9FF', 'Seu pedido foi confirmado.'),
('step_processing', 'wf_demo', 'processing', 'Em andamento', 3, '#FFC107', 'Seu pedido está em andamento.'),
('step_ready', 'wf_demo', 'ready', 'Pronto', 4, '#FF9800', 'Seu pedido está pronto.'),
('step_done', 'wf_demo', 'done', 'Concluído', 5, '#0B2B7C', 'Pedido concluído. Obrigado!');

INSERT OR IGNORE INTO catalog_items
(id, tenant_id, sku, name, description, item_type, category, unit, pricing_mode, price_cents, active, stock_control, stock_qty, attributes_json, options_json)
VALUES
('item_1', 'tenant_demo', 'DEMO-001', 'Produto Destaque', 'Produto demonstrativo para homologação do catálogo adaptável.', 'product', 'Destaques', 'un', 'fixed', 3990, 1, 1, 25, '{}', '[{"name":"Cor","values":["Azul","Amarelo"]}]'),
('item_2', 'tenant_demo', 'DEMO-002', 'Serviço Express', 'Exemplo de serviço vendido no mesmo catálogo.', 'service', 'Serviços', 'serv', 'fixed', 8900, 1, 0, 0, '{"duration_minutes":60}', '[]'),
('item_3', 'tenant_demo', 'DEMO-003', 'Kit NegocIAJá', 'Combo demonstrativo com preço promocional.', 'bundle', 'Combos', 'kit', 'fixed', 12990, 1, 1, 12, '{}', '[]');

INSERT OR IGNORE INTO automation_rules
(id, tenant_id, name, trigger_type, trigger_config_json, action_type, action_config_json, active)
VALUES
('auto_1', 'tenant_demo', 'Confirmar novo pedido', 'order.created', '{}', 'message.send', '{"template":"order_received"}', 1),
('auto_2', 'tenant_demo', 'Recuperar pedido sem avanço', 'order.stale', '{"after_hours":24}', 'message.send', '{"template":"order_recovery"}', 1);
