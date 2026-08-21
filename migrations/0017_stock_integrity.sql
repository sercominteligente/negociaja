-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

-- A validação no Worker melhora a mensagem para o usuário; este trigger é a
-- última barreira contra duas vendas concorrentes consumirem o mesmo estoque.
CREATE TRIGGER IF NOT EXISTS trg_catalog_stock_nonnegative_insert
BEFORE INSERT ON catalog_items
WHEN NEW.stock_control=1 AND NEW.stock_qty < 0
BEGIN
  SELECT RAISE(ABORT,'controlled_stock_cannot_be_negative');
END;

CREATE TRIGGER IF NOT EXISTS trg_catalog_stock_nonnegative_update
BEFORE UPDATE OF stock_qty,stock_control ON catalog_items
WHEN NEW.stock_control=1 AND NEW.stock_qty < 0
BEGIN
  SELECT RAISE(ABORT,'controlled_stock_cannot_be_negative');
END;
