interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  HML_BOOTSTRAP_TOKEN?: string;
}

type Dict = Record<string, unknown>;
type Role = 'super_admin' | 'admin' | 'operator';
type Actor = {
  sessionId: string;
  actorId: string;
  actorType: 'platform_user' | 'tenant_user';
  role: Role;
  tenantId: string | null;
  name: string;
  email: string;
};

const SESSION_COOKIE = 'negociaja_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const PASSWORD_ITERATIONS = 210000;

const json = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  }
});

const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

async function body(request: Request): Promise<Dict> {
  try { return await request.json() as Dict; } catch { return {}; }
}

const cents = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function sha256(value: string) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function derivePassword(password: string, saltBase64: string, iterations = PASSWORD_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: base64ToBytes(saltBase64),
    iterations,
    hash: 'SHA-256'
  }, material, 256);
  return bytesToBase64(new Uint8Array(bits));
}

async function createPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = bytesToBase64(salt);
  return { salt: saltBase64, hash: await derivePassword(password, saltBase64), iterations: PASSWORD_ITERATIONS };
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function audit(env: Env, actor: Actor | null, tenantId: string | null, action: string, entityType?: string, entityId?: string, metadata: Dict = {}) {
  await env.DB.prepare(`INSERT INTO audit_logs
    (id, tenant_id, actor_type, actor_id, actor_role, action, entity_type, entity_id, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(makeId('audit'), tenantId, actor?.actorType || 'system', actor?.actorId || null, actor?.role || null,
      action, entityType || null, entityId || null, JSON.stringify(metadata)).run();
}

async function authenticate(request: Request, env: Env): Promise<Actor | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT s.id session_id, s.user_id, s.platform_user_id, s.tenant_id, s.role,
      u.name user_name, u.email user_email, u.status user_status,
      p.name platform_name, p.email platform_email, p.status platform_status
    FROM auth_sessions s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN platform_users p ON p.id = s.platform_user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND datetime(s.expires_at) > datetime('now')
    LIMIT 1`).bind(tokenHash).first<{
      session_id:string;user_id:string|null;platform_user_id:string|null;tenant_id:string|null;role:Role;
      user_name:string|null;user_email:string|null;user_status:string|null;
      platform_name:string|null;platform_email:string|null;platform_status:string|null;
    }>();
  if (!row) return null;
  if (row.user_id && row.user_status !== 'active') return null;
  if (row.platform_user_id && row.platform_status !== 'active') return null;
  await env.DB.prepare("UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE id = ?").bind(row.session_id).run();
  return {
    sessionId: row.session_id,
    actorId: row.user_id || row.platform_user_id || '',
    actorType: row.user_id ? 'tenant_user' : 'platform_user',
    role: row.role,
    tenantId: row.tenant_id,
    name: row.user_name || row.platform_name || 'Usuário',
    email: row.user_email || row.platform_email || ''
  };
}

function hasRole(actor: Actor, allowed: Role[]) {
  return allowed.includes(actor.role);
}

async function resolveTenant(request: Request, env: Env, actor: Actor): Promise<string | null> {
  if (actor.role !== 'super_admin') return actor.tenantId;
  const requested = request.headers.get('x-tenant-id') || new URL(request.url).searchParams.get('tenant_id');
  if (!requested) return null;
  const exists = await env.DB.prepare('SELECT id FROM tenants WHERE id = ? LIMIT 1').bind(requested).first<{id:string}>();
  return exists?.id || null;
}

async function handleAuth(request: Request, env: Env, url: URL): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (method === 'POST' && url.pathname === '/api/auth/bootstrap') {
    if (!env.HML_BOOTSTRAP_TOKEN) return json({ error: 'Bootstrap desabilitado neste ambiente.' }, 503);
    const supplied = request.headers.get('x-bootstrap-token') || '';
    if (!safeEqual(supplied, env.HML_BOOTSTRAP_TOKEN)) return json({ error: 'Bootstrap não autorizado.' }, 403);
    const input = await body(request);
    const email = String(input.email || '').trim().toLowerCase();
    const name = String(input.name || '').trim();
    const password = String(input.password || '');
    const scope = input.scope === 'platform' ? 'platform' : 'tenant';
    if (!email || !name || password.length < 10) return json({ error: 'Informe nome, e-mail e senha com pelo menos 10 caracteres.' }, 400);
    const credentials = await createPassword(password);

    if (scope === 'platform') {
      const existing = await env.DB.prepare('SELECT id FROM platform_users WHERE email = ? LIMIT 1').bind(email).first<{id:string}>();
      const id = existing?.id || makeId('puser');
      if (existing) {
        await env.DB.prepare(`UPDATE platform_users SET name = ?, password_hash = ?, password_salt = ?, password_iterations = ?, status = 'active', updated_at = datetime('now') WHERE id = ?`)
          .bind(name, credentials.hash, credentials.salt, credentials.iterations, id).run();
      } else {
        await env.DB.prepare(`INSERT INTO platform_users (id, name, email, role, password_hash, password_salt, password_iterations)
          VALUES (?, ?, ?, 'super_admin', ?, ?, ?)`)
          .bind(id, name, email, credentials.hash, credentials.salt, credentials.iterations).run();
      }
      await audit(env, null, null, 'auth.bootstrap.platform_user', 'platform_user', id, { email });
      return json({ data: { id, email, role: 'super_admin' } }, 201);
    }

    const tenantSlug = String(input.tenant_slug || '').trim();
    if (!tenantSlug) return json({ error: 'tenant_slug é obrigatório para usuário da empresa.' }, 400);
    const tenant = await env.DB.prepare('SELECT id, name FROM tenants WHERE slug = ? LIMIT 1').bind(tenantSlug).first<{id:string;name:string}>();
    if (!tenant) return json({ error: 'Empresa não encontrada.' }, 404);
    const existing = await env.DB.prepare('SELECT id FROM users WHERE tenant_id = ? AND email = ? LIMIT 1')
      .bind(tenant.id, email).first<{id:string}>();
    const id = existing?.id || makeId('user');
    if (existing) {
      await env.DB.prepare(`UPDATE users SET name = ?, role = 'admin', status = 'active', password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?`)
        .bind(name, credentials.hash, credentials.salt, credentials.iterations, id).run();
    } else {
      await env.DB.prepare(`INSERT INTO users (id, tenant_id, name, email, role, status, password_hash, password_salt, password_iterations)
        VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, ?)`)
        .bind(id, tenant.id, name, email, credentials.hash, credentials.salt, credentials.iterations).run();
    }
    await audit(env, null, tenant.id, 'auth.bootstrap.tenant_admin', 'user', id, { email, tenant_slug: tenantSlug });
    return json({ data: { id, email, role: 'admin', tenant_id: tenant.id, tenant_name: tenant.name } }, 201);
  }

  if (method === 'POST' && url.pathname === '/api/auth/login') {
    const input = await body(request);
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    const tenantSlug = String(input.tenant_slug || '').trim();
    if (!email || !password) return json({ error: 'E-mail e senha são obrigatórios.' }, 400);

    let actorId = '';
    let role: Role;
    let tenantId: string | null = null;
    let name = '';
    let hash = '';
    let salt = '';
    let iterations = PASSWORD_ITERATIONS;
    let actorType: Actor['actorType'];

    if (tenantSlug) {
      const user = await env.DB.prepare(`SELECT u.id, u.name, u.role, u.status, u.password_hash, u.password_salt, u.password_iterations, t.id tenant_id
        FROM users u JOIN tenants t ON t.id = u.tenant_id
        WHERE lower(u.email) = ? AND t.slug = ? LIMIT 1`).bind(email, tenantSlug).first<{
          id:string;name:string;role:Role;status:string;password_hash:string|null;password_salt:string|null;password_iterations:number;tenant_id:string;
        }>();
      if (!user || user.status !== 'active' || !user.password_hash || !user.password_salt) return json({ error: 'Credenciais inválidas.' }, 401);
      actorId = user.id; role = user.role; tenantId = user.tenant_id; name = user.name;
      hash = user.password_hash; salt = user.password_salt; iterations = user.password_iterations; actorType = 'tenant_user';
    } else {
      const user = await env.DB.prepare(`SELECT id, name, role, status, password_hash, password_salt, password_iterations
        FROM platform_users WHERE lower(email) = ? LIMIT 1`).bind(email).first<{
          id:string;name:string;role:Role;status:string;password_hash:string|null;password_salt:string|null;password_iterations:number;
        }>();
      if (!user || user.status !== 'active' || !user.password_hash || !user.password_salt) return json({ error: 'Credenciais inválidas.' }, 401);
      actorId = user.id; role = user.role; name = user.name;
      hash = user.password_hash; salt = user.password_salt; iterations = user.password_iterations; actorType = 'platform_user';
    }

    const derived = await derivePassword(password, salt, iterations);
    if (!safeEqual(derived, hash)) return json({ error: 'Credenciais inválidas.' }, 401);

    const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
    const tokenHash = await sha256(rawToken);
    const sessionId = makeId('sess');
    const expires = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    const ip = request.headers.get('cf-connecting-ip') || '';
    const ipHash = ip ? await sha256(ip) : null;
    await env.DB.prepare(`INSERT INTO auth_sessions
      (id, token_hash, user_id, platform_user_id, tenant_id, role, expires_at, ip_hash, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(sessionId, tokenHash, actorType === 'tenant_user' ? actorId : null, actorType === 'platform_user' ? actorId : null,
        tenantId, role, expires, ipHash, (request.headers.get('user-agent') || '').slice(0, 500)).run();
    if (actorType === 'tenant_user') {
      await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(actorId).run();
    } else {
      await env.DB.prepare("UPDATE platform_users SET last_login_at = datetime('now') WHERE id = ?").bind(actorId).run();
    }
    const actor: Actor = { sessionId, actorId, actorType, role, tenantId, name, email };
    await audit(env, actor, tenantId, 'auth.login', actorType, actorId);
    return json({ data: { user: { id: actorId, name, email, role, tenant_id: tenantId } } }, 200, { 'set-cookie': sessionCookie(rawToken) });
  }

  if (method === 'GET' && url.pathname === '/api/auth/me') {
    const actor = await authenticate(request, env);
    if (!actor) return json({ error: 'Não autenticado.' }, 401);
    return json({ data: { user: { id: actor.actorId, name: actor.name, email: actor.email, role: actor.role, tenant_id: actor.tenantId } } });
  }

  if (method === 'POST' && url.pathname === '/api/auth/logout') {
    const actor = await authenticate(request, env);
    if (actor) {
      await env.DB.prepare("UPDATE auth_sessions SET revoked_at = datetime('now') WHERE id = ?").bind(actor.sessionId).run();
      await audit(env, actor, actor.tenantId, 'auth.logout', actor.actorType, actor.actorId);
    }
    return json({ data: { ok: true } }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  return null;
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/')) return null;
  const method = request.method.toUpperCase();

  if (method === 'GET' && url.pathname === '/api/health') {
    return json({ ok: true, app: 'NegocIAJá!', version: '0.2.0', now: new Date().toISOString() });
  }

  const authResponse = await handleAuth(request, env, url);
  if (authResponse) return authResponse;

  const actor = await authenticate(request, env);
  if (!actor) return json({ error: 'Sessão ausente ou expirada.' }, 401);
  const tenantId = await resolveTenant(request, env, actor);
  if (!tenantId) return json({ error: actor.role === 'super_admin' ? 'Selecione um tenant válido.' : 'Tenant da sessão inválido.' }, 400);

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
      activeConversations: conversations?.total ?? 0,
      session: { name: actor.name, role: actor.role, tenantId }
    }});
  }

  if (method === 'GET' && url.pathname === '/api/catalog') {
    const result = await env.DB.prepare(`SELECT id, sku, name, description, item_type, category, unit, pricing_mode,
      price_cents, active, stock_control, stock_qty, attributes_json, options_json, image_key
      FROM catalog_items WHERE tenant_id = ? AND active = 1 ORDER BY category, name`).bind(tenantId).all();
    return json({ data: result.results });
  }

  if (method === 'POST' && url.pathname === '/api/catalog') {
    if (!hasRole(actor, ['admin', 'super_admin'])) return json({ error: 'Permissão insuficiente para alterar catálogo.' }, 403);
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
    await audit(env, actor, tenantId, 'catalog.create', 'catalog_item', id, { name });
    return json({ data: { id, name } }, 201);
  }

  const catalogRoute = url.pathname.match(/^\/api\/catalog\/([^/]+)$/);
  if (method === 'PATCH' && catalogRoute) {
    if (!hasRole(actor, ['admin', 'super_admin'])) return json({ error: 'Permissão insuficiente para alterar catálogo.' }, 403);
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
    await audit(env, actor, tenantId, 'catalog.update', 'catalog_item', id, { active: Boolean(active) });
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
    if (!hasRole(actor, ['operator', 'admin', 'super_admin'])) return json({ error: 'Permissão insuficiente.' }, 403);
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
      env.DB.prepare(`INSERT INTO order_events (id, order_id, event_type, to_status, actor_type, actor_id, payload_json)
        VALUES (?, ?, 'order.created', 'new', 'operator', ?, ?)`)
        .bind(makeId('evt'), orderId, actor.actorId, JSON.stringify({ source: input.source || 'web' }))
    ];
    resolved.forEach((line) => statements.push(env.DB.prepare(`INSERT INTO order_items
      (id, order_id, catalog_item_id, name, qty, unit_price_cents, total_cents, options_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(line.id, orderId, line.catalogId, line.name, line.qty, line.unit, line.total, line.options)));
    await env.DB.batch(statements);
    await audit(env, actor, tenantId, 'order.create', 'order', orderId, { public_code: publicCode, total_cents: total });
    return json({ data: { id: orderId, public_code: publicCode, status: 'new', total_cents: total } }, 201);
  }

  const statusRoute = url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (method === 'PATCH' && statusRoute) {
    if (!hasRole(actor, ['operator', 'admin', 'super_admin'])) return json({ error: 'Permissão insuficiente.' }, 403);
    const input = await body(request);
    const nextStatus = String(input.status || '').trim();
    if (!nextStatus) return json({ error: 'Status obrigatório.' }, 400);
    const id = statusRoute[1];
    const current = await env.DB.prepare('SELECT status, workflow_id FROM orders WHERE id = ? AND tenant_id = ?')
      .bind(id, tenantId).first<{status:string;workflow_id:string|null}>();
    if (!current) return json({ error: 'Pedido não encontrado.' }, 404);
    const valid = await env.DB.prepare(`SELECT ws.step_key FROM workflow_steps ws
      JOIN workflow_templates wt ON wt.id = ws.workflow_id
      WHERE wt.tenant_id = ? AND ws.step_key = ? AND (? IS NULL OR wt.id = ?) LIMIT 1`)
      .bind(tenantId, nextStatus, current.workflow_id, current.workflow_id).first<{step_key:string}>();
    if (!valid) return json({ error: 'Etapa inválida para o workflow deste tenant.' }, 400);
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").bind(nextStatus, id, tenantId),
      env.DB.prepare('INSERT INTO order_events (id, order_id, event_type, from_status, to_status, actor_type, actor_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(makeId('evt'), id, 'order.status.changed', current.status, nextStatus, 'operator', actor.actorId)
    ]);
    await audit(env, actor, tenantId, 'order.status.change', 'order', id, { from: current.status, to: nextStatus });
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
    if (!hasRole(actor, ['operator', 'admin', 'super_admin'])) return json({ error: 'Permissão insuficiente.' }, 403);
    const input = await body(request);
    const mode = input.mode === 'ai' ? 'ai' : 'human';
    const result = await env.DB.prepare('UPDATE conversations SET status = ? WHERE id = ? AND tenant_id = ?')
      .bind(mode, takeoverRoute[1], tenantId).run();
    if (!result.meta.changes) return json({ error: 'Conversa não encontrada.' }, 404);
    await audit(env, actor, tenantId, 'conversation.takeover', 'conversation', takeoverRoute[1], { mode });
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

      if (url.pathname === '/login' || url.pathname === '/login/') {
        const actor = await authenticate(request, env);
        if (actor) return Response.redirect(new URL('/app', url.origin).toString(), 302);
        return env.ASSETS.fetch(new Request(new URL('/login.html', url.origin), request));
      }

      if (url.pathname === '/app' || url.pathname === '/app/') {
        const actor = await authenticate(request, env);
        if (!actor) return Response.redirect(new URL('/login', url.origin).toString(), 302);
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