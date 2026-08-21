-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
ALTER TABLE platform_marketing ADD COLUMN testimonials_kicker TEXT DEFAULT 'QUEM USA, RECOMENDA';
ALTER TABLE platform_marketing ADD COLUMN testimonials_title TEXT DEFAULT 'Negócios reais. Resultados que aparecem.';
ALTER TABLE platform_marketing ADD COLUMN testimonials_subtitle TEXT DEFAULT 'Veja como o NegocIAJá! ajuda empresas a organizar o atendimento, vender melhor e manter o cliente por perto.';

CREATE TABLE IF NOT EXISTS platform_testimonials (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_role TEXT,
  company_name TEXT,
  quote TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  logo_key TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_platform_testimonials_active ON platform_testimonials(active,sort_order,created_at);
