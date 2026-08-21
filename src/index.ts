interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
}

type Dict = Record<string, unknown>;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }
});

const tenantFrom = (request: Request) => request.headers.get('x-tenant-id') || 'tenant_demo';
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

async function body(request: Request): Promise<Dict> {
  try { return await request.json() as Dict; } catch { return {}; }
}

const cents = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

async function handleApi(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/')) return null;
  const tenantId = tenantFrom(request);
  const method = request.method.toUpperCase();

  if (method === 'GET' && url.pathname === '/api/health') {
    return json({ ok: true, app: 'NegocIAJá!', version: '0.1.0', tenantId, now: new Date().toISOString() });
  }

  if (method === 'GET' && url.pathname === '/api/dashboard') {
    const [customers, catalog, openOrders, sales, conversations] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) total FROM customers WHERE tenant_id = ?').bind(tenantId).first<{total:number}>(),
      env.DB.prepare('SELECT COUNT(*) total FROM catalog_items WHERE tenant_id = ? AND active = 1').bind(tenantId).first<{total:number}>(),
      env.DB.prepare("SELECT COUNT(*) total FROM orders WHERE tenant_id = ? AND status NOT IN ('done','cancelled')").bind(tenantId).first<{total:number}>(),
      env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) total FROM orders WHERE tenant_id = ? AND status != 'cancelled'").bind(tenantId).first<{total:number}>(),
      env.DB.prepare("SELECT COUNT(*) total FROM conversations WHERE tenant_id = ? AND status IN ('ai','human')").bind(tenantId).first<{total:number}>()
    ]);
    return json({ data: {
      customers: customers?.total ?? 0,
      catalogItems: catalog?.total ?? 0,
      openOrders: openOrders?.total ?? 0,
      salesCents: sales?.total ?? 0,
      activeConversations: conversations?.total ?? 0
    }});
  }

  if (method === 'GET' && url.pathname === '/api/catalog') {
    const result = await env.DB.prepare(`SELECT id, sku, name, description, item_type, category, unit, pricing_mode,
      price_cents, active, stock_control, stock_qty, attributes_json, options_json, image_key
      FROM catalog_items WHERE tenant_id = ? AND active = 1 ORDER BY category, name`).bind(tenantId).all();
    return json({ data: result.results });
  }

  if (method === 'POST' && url.pathname === '/api/catalog') {
    const input = await body(request);
    const name = String(input.name || '').trim();
    if (!name) return json({ error: 'Nome do item é obrigatório.' }, 400);
    const id = makeId('item');
    await env.DB.prepare(`INSERT INTO catalog_items
      (id, tenant_id, sku, name, description, item_type, category, unit, pricing_mode, price_cents,
       active, stock_control, stock_qty, attributes_json, options_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .bind(id, tenantId, input.sku ? String(input.sku) : null, name,
        input.description ? String(input.description) : null, String(input.item_type || 'product'),
        input.category ? String(input.category) : null, String(input.unit || 'un'),
        String(input.pricing_mode || 'fixed'), cents(input.price_cents), input.stock_control ? 1 : 0,
        Number(input.stock_qty || 0), JSON.stringify(input.attributes || {}), JSON.stringify(input.options || [])).run();
    return json({ data: { id, name } }, 201);
  }

  const catalogRoute = url.pathname.match(/^\/api\/catalog\/([^/]+)$/);
  if (method === 'PATCH' && catalogRoute) {
    const input = await body(request);
    const id = catalogRoute[1];
    const current = await env.DB.prepare(`SELECT id, name, item_type, category, price_cents, stock_control, stock_qty, active
      FROM catalog_items WHERE id = ? AND tenant_id = ? LIMIT 1`).bind(id, tenantId)
      .first<{id:string;name:string;item_type:string;category:string|null;price_cents:number;stock_control:number;stock_qty:number;active:number}>();
    if (!current) return json({ error: 'Item não encontrado.' }, 404);

    const name = input.name === undefined ? current.name : String(input.name || '').trim();
    if (!name) return json({ error: 'Nome do item é obrigatório.' }, 400);
    const itemType = input.item_type === undefined ? current.item_type : String(input.item_type || 'product');
    const category = input.category === undefined ? current.category : (input.category ? String(input.category) : null);
    const priceCents = input.price_cents === undefined ? current.price_cents : cents(input.price_cents);
    const stockControl = input.stock_control === undefined ? current.stock_control : (input.stock_control ? 1 : 0);
    const stockQty = input.stock_qty === undefined ? current.stock_qty : Math.max(0, Number(input.stock_qty || 0));
    const active = input.active === undefined ? current.active : (input.active ? 1 : 0);

    await env.DB.prepare(`UPDATE catalog_items SET name = ?, item_type = ?, category = ?, price_cents = ?,
      stock_control = ?, stock_qty = ?, active = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
      .bind(name, itemType, category, priceCents, stockControl, stockQty, active, id, tenantId).run();
    return json({ data: { id, name, active: Boolean(active) } });
  }

  if (method === 'GET' && url.pathname === '/api/orders') {
    const result = await env.DB.prepare(`SELECT o.id, o.public_code, o.transaction_type, o.status, o.source,
      o.total_cents, o.payment_status, o.fulfillment_type, o.created_at,
      c.name customer_name, c.phone customer_phone
      FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.tenant_id = ? ORDER BY o.created_at DESC LIMIT 100`).bind(tenantId).all();
    return json({ data: result.results });
  }

  if (method === 'POST' && url.pathname === '/api/orders') {
    const input = await body(request);
    const lines = Array.isArray(input.items) ? input.items as Array<Dict> : [];
    if (!lines.length) return json({ error: 'Adicione pelo menos um item.' }, 400);

    const customerName = String(input.customer_name || 'Cliente').trim();
    const phone = input.customer_phone ? String(input.customer_phone) : null;
    let customerId: string | null = null;
    if (phone) {
      const found = await env.DB.prepare('SELECT id FROM customers WHERE tenant_id = ? AND phone = ? LIMIT 1')
        .bind(tenantId, phone).first<{id:string}>();
      customerId = found?.id || null;
    }
    if (!customerId) {
      customerId = makeId('cus');
      await env.DB.prepare('INSERT INTO customers (id, tenant_id, name, phone) VALUES (?, ?, ?, ?)')
        .bind(customerId, tenantId, customerName, phone).run();
    }

    const resolved: Array<{id:string;catalogId:string;name:string;qty:number;unit:number;total:number;options:string}> = [];
    for (const line of lines) {
      const catalogId = String(line.catalog_item_id || '');
      const qty = Math.max(.001, Number(line.qty || 1));
      const product = await env.DB.prepare('SELECT id, name, price_cents FROM catalog_items WHERE id = ? AND tenant_id = ? AND active = 1')
        .bind(catalogId, tenantId).first<{id:string;name:string;price_cents:number}>();
      if (!product) return json({ error: `Item inválido: ${catalogId}` }, 400);
      const total = Math.round(product.price_cents * qty);
      resolved.push({ id: makeId('line'), catalogId, name: product.name, qty, unit: product.price_cents, total, options: JSON.stringify(line.options || {}) });
    }

    const orderId = makeId('ord');
    const publicCode = `NJ-${Date.now().toString(36).toUpperCase()}`;
    const subtotal = resolved.reduce((sum, item) => sum + item.total, 0);
    const delivery = cents(input.delivery_cents);
    const discount = Math.min(subtotal + delivery, cents(input.discount_cents));
    const total = subtotal + delivery - discount;

    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`INSERT INTO orders
        (id, tenant_id, customer_id, public_code, source, transaction_type, status, subtotal_cents,
         delivery_cents, discount_cents, total_cents, fulfillment_type, notes)
         VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?)`)
        .bind(orderId, tenantId, customerId, publicCode, String(input.source || 'web'), String(input.transaction_type || 'order'),
          subtotal, delivery, discount, total, String(input.fulfillment_type || 'pickup'), input.notes ? String(input.notes) : null),
      env.DB.prepare(`INSERT INTO order_events (id, order_id, event_type, to_status, actor_type, payload_json)
        VALUES (?, ?, 'order.created', 'new', 'system', ?)`)
        .bind(makeId('evt'), orderId, JSON.stringify({ source: input.source || 'web' }))
    ];
    resolved.forEach((line) => statements.push(env.DB.prepare(`INSERT INTO order_items
      (id, order_id, catalog_item_id, name, qty, unit_price_cents, total_cents, options_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(line.id, orderId, line.catalogId, line.name, line.qty, line.unit, line.total, line.options)));
    await env.DB.batch(statements);
    return json({ data: { id: orderId, public_code: publicCode, status: 'new', total_cents: total } }, 201);
  }

  const statusRoute = url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (method === 'PATCH' && statusRoute) {
    const input = await body(request);
    const nextStatus = String(input.status || '').trim();
    if (!nextStatus) return json({ error: 'Status obrigatório.' }, 400);
    const id = statusRoute[1];
    const current = await env.DB.prepare('SELECT status FROM orders WHERE id = ? AND tenant_id = ?')
      .bind(id, tenantId).first<{status:string}>();
    if (!current) return json({ error: 'Pedido não encontrado.' }, 404);
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(nextStatus, id, tenantId),
      env.DB.prepare('INSERT INTO order_events (id, order_id, event_type, from_status, to_status, actor_type) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(makeId('evt'), id, 'order.status.changed', current.status, nextStatus, 'operator')
    ]);
    return json({ data: { id, from: current.status, status: nextStatus } });
  }

  if (method === 'GET' && url.pathname === '/api/workflows') {
    const result = await env.DB.prepare(`SELECT wt.id workflow_id, wt.name workflow_name, wt.transaction_type,
      ws.id step_id, ws.step_key, ws.label, ws.sort_order, ws.color, ws.customer_message
      FROM workflow_templates wt LEFT JOIN workflow_steps ws ON ws.workflow_id = wt.id
      WHERE wt.tenant_id = ? ORDER BY wt.name, ws.sort_order`).bind(tenantId).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/automations') {
    const result = await env.DB.prepare(`SELECT id, name, trigger_type, action_type, active, created_at
      FROM automation_rules WHERE tenant_id = ? ORDER BY created_at DESC`).bind(tenantId).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/conversations') {
    const result = await env.DB.prepare(`SELECT cv.id, cv.status, cv.external_id, cv.last_message_at,
      ch.channel_type, ch.name channel_name, c.name customer_name, c.phone customer_phone
      FROM conversations cv LEFT JOIN channels ch ON ch.id = cv.channel_id
      LEFT JOIN customers c ON c.id = cv.customer_id
      WHERE cv.tenant_id = ? ORDER BY COALESCE(cv.last_message_at, cv.created_at) DESC LIMIT 100`).bind(tenantId).all();
    return json({ data: result.results });
  }

  const takeoverRoute = url.pathname.match(/^\/api\/conversations\/([^/]+)\/takeover$/);
  if (method === 'POST' && takeoverRoute) {
    const input = await body(request);
    const mode = input.mode === 'ai' ? 'ai' : 'human';
    const result = await env.DB.prepare('UPDATE conversations SET status = ? WHERE id = ? AND tenant_id = ?')
      .bind(mode, takeoverRoute[1], tenantId).run();
    if (!result.meta.changes) return json({ error: 'Conversa não encontrada.' }, 404);
    return json({ data: { id: takeoverRoute[1], status: mode } });
  }

  return json({ error: 'Endpoint não encontrado.' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      const apiResponse = await handleApi(request, env, url);
      if (apiResponse) return apiResponse;
      if (url.pathname === '/app' || url.pathname === '/app/') {
        return env.ASSETS.fetch(new Request(new URL('/app.html', url.origin), request));
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('NegocIAJá error', error);
      return url.pathname.startsWith('/api/')
        ? json({ error: 'Erro interno.', requestId: crypto.randomUUID() }, 500)
        : new Response('NegocIAJá temporariamente indisponível.', { status: 500 });
    }
  }
};