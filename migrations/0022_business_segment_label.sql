-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

ALTER TABLE tenant_settings ADD COLUMN segment_label TEXT;

UPDATE tenant_settings
SET segment_label=(SELECT CASE t.segment
  WHEN 'loja' THEN 'Loja / Varejo'
  WHEN 'delivery' THEN 'Restaurante / Delivery'
  WHEN 'comunicacao-visual' THEN 'Comunicação Visual / Gráfica'
  WHEN 'servicos' THEN 'Prestador de Serviços'
  ELSE 'Personalizado' END FROM tenants t WHERE t.id=tenant_settings.tenant_id)
WHERE segment_label IS NULL;
