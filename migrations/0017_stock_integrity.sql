-- NegocIAJá! — desenvolvido pela SER Comunicação
-- CNPJ 23.296.513/0001-97 — Todos os direitos reservados.
PRAGMA foreign_keys = ON;

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

-- Toda rota que insere um order_item passa pela mesma barreira transacional.
CREATE TRIGGER IF NOT EXISTS trg_order_item_stock_guard
BEFORE INSERT ON order_items
WHEN NEW.catalog_item_id IS NOT NULL
 AND COALESCE((SELECT stock_control FROM catalog_items WHERE id=NEW.catalog_item_id),0)=1
 AND COALESCE((SELECT stock_qty FROM catalog_items WHERE id=NEW.catalog_item_id),0) < NEW.qty
BEGIN
  SELECT RAISE(ABORT,'insufficient_controlled_stock');
END;

CREATE TRIGGER IF NOT EXISTS trg_order_item_stock_decrement
AFTER INSERT ON order_items
WHEN NEW.catalog_item_id IS NOT NULL
 AND COALESCE((SELECT stock_control FROM catalog_items WHERE id=NEW.catalog_item_id),0)=1
BEGIN
  UPDATE catalog_items
  SET stock_qty=stock_qty-NEW.qty,updated_at=datetime('now')
  WHERE id=NEW.catalog_item_id;
END;
