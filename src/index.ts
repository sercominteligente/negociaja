import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_ENVIRONMENT: string;
  DEFAULT_TENANT_ID: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  HML_USERNAME?: string;
  HML_PASSWORD?: string;
}

type Dict = Record<string, unknown>;

type AuthContext = {
  tenantId: string;
  email?: string;
  subject?: string;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const APP_HOST = 'app.negociaja.com.br';
const PUBLIC_HOSTS = new Set(['negociaja.com.br', 'www.negociaja.com.br']);
const MAX_JSON_BODY_BYTES = 64 * 1024;
const MAX_MONEY_CENTS = 100_000_000_000;

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const isProduction = (env: Env) => env.APP_ENVIRONMENT === 'production';
const isHml = (env: Env) => env.APP_ENVIRONMENT === 'hml';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

function secureResponse(response: Response, privateContent = false): Response {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set(
    'content-security-policy',
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data:; font-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; upgrade-insecure-requests"
  );
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  if (privateContent) {
    headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
    headers.set('cache-control', 'no-store');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function notFound(privateContent = false): Response {
  return secureResponse(json({ error: 'Não encontrado.' }, 404), privateContent);
}

function redirectToApp(): Response {
  return secureResponse(Response.redirect(`https://${APP_HOST}/`, 302), false);
}

function hmlAuthorized(request: Request, env: Env): boolean {
  const expectedPassword = env.HML_PASSWORD;
  if (!expectedPassword) return false;

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Basic ')) return false;

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return username === (env.HML_USERNAME || 'homologacao') && password === expectedPassword;
  } catch {
    return false;
  }
}

function hmlChallenge(): Response {
  return secureResponse(
    new Response('Autenticação necessária para a homologação.', {
      status: 401,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'www-authenticate': 'Basic realm="NegocIAJá HML", charset="UTF-8"'
      }
    }),
    true
  );
}

function getJwks(teamDomain: string) {
  const normalized = teamDomain.replace(/\/+$/, '');
  const certsUrl = `${normalized}/cdn-cgi/access/certs`;
  let jwks = jwksCache.get(certsUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(certsUrl));
    jwksCache.set(certsUrl, jwks);
  }
  return jwks;
}

async function verifyAccess(request: Request, env: Env): Promise<JWTPayload> {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new HttpError(403, 'Acesso não autorizado.');

  const issuer = env.ACCESS_TEAM_DOMAIN.replace(/\/+$/, '');
  if (!issuer || !env.ACCESS_AUD) {
    throw new HttpError(503, 'Configuração de autenticação indisponível.');
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(issuer), {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256']
    });
    return payload;
  } catch (error) {
    console.warn('Cloudflare Access JWT rejected', error);
    throw new HttpError(403, 'Acesso não autorizado.');
  }
}

function localAuth(env: Env): AuthContext {
  return { tenantId: env.DEFAULT_TENANT_ID || 'tenant_demo', email: 'local@negociaja.invalid', subject: 'local-dev' };
}

async function authForRequest(request: Request, env: Env): Promise<AuthContext> {
  if (!isProduction(env)) return localAuth(env);

  const payload = await verifyAccess(request, env);
  return {
    tenantId: env.DEFAULT_TENANT_ID,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    subject: typeof payload.sub === 'string' ? payload.sub : undefined
  };
}

function ensureAllowedOrigin(request: Request, env: Env): void {
  if (isProduction(env)) {
    const origin = request.headers.get('origin');
    if (origin !== `https://${APP_HOST}`) {
      throw new HttpError(403, 'Origem não autorizada.');
    }
    return;
  }

  if (isHml(env)) {
    const origin = request.headers.get('origin');
    if (origin !== new URL(request.url).origin) {
      throw new HttpError(403, 'Origem não autorizada.');
    }
  }
}

function ensureJsonMutation(request: Request, env: Env): void {
  ensureAllowedOrigin(request, env);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Envie o corpo como application/json.');
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length < 0 || length > MAX_JSON_BODY_BYTES) {
      throw new HttpError(413, 'Corpo da requisição muito grande.');
    }
  }
}

async function readJsonBody(request: Request): Promise<Dict> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, 'Corpo da requisição muito grande.');
  }
  if (!bytes.byteLength) return {};

  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid shape');
    }
    return parsed as Dict;
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

function stringField(value: unknown, label: string, maxLength: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${label} é obrigatório.`);
    return null;
  }
  const result = String(value).trim();
  if (required && !result) throw new HttpError(400, `${label} é obrigatório.`);
  if (result.length > maxLength) throw new HttpError(400, `${label} excede o limite permitido.`);
  return result || null;
}

function enumField<T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T {
  const normalized = String(value ?? fallback) as T;
  if (!allowed.includes(normalized)) throw new HttpError(400, `${label} inválido.`);
  return normalized;
}

function moneyCents(value: unknown, label = 'Valor'): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY_CENTS) {
    throw new HttpError(400, `${label} inválido.`);
  }
  return Math.round(n);
}

function quantity(value: unknown): number {
  const n = Number(value ?? 1);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) {
    throw new HttpError(400, 'Quantidade inválida.');
  }
  return Math.round(n * 1000) / 1000;
}

function stockQuantity(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw new HttpError(400, 'Estoque inválido.');
  }
  return Math.round(n * 1000) / 1000;
}

function safeJson(value: unknown, fallback: Dict | unknown[] = {}): string {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    throw new HttpError(400, 'Estrutura de dados inválida.');
  }
}

async function allowedOrderStatus(env: Env, tenantId: string, status: string): Promise<boolean> {
  if (status === 'cancelled') return true;
  const row = await env.DB.prepare(`
    SELECT 1 ok
    FROM workflow_steps ws
    INNER JOIN workflow_templates wt ON wt.id = ws.workflow_id
    WHERE wt.tenant_id = ? AND ws.step_key = ?
    LIMIT 1
  `).bind(tenantId, status).first<{ ok: number }>();
  return Boolean(row?.ok);
}

async function handleApi(request: Request, env: Env, url: URL, auth: AuthContext): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/')) return null;

  const tenantId = auth.tenantId;
  const method = request.method.toUpperCase();

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    ensureJsonMutation(request, env);
  }

  if (method === 'GET' && url.pathname === '/api/health') {
    return json({
      ok: true,
      app: 'NegocIAJá!',
      version: '0.1.0-recovery',
      environment: env.APP_ENVIRONMENT,
      now: new Date().toISOString()
    });
  }

  if (method === 'GET' && url.pathname === '/api/session') {
    return json({
      data: {
        tenant_id: tenantId,
        email: auth.email || null,
        subject: auth.subject || null,
        environment: env.APP_ENVIRONMENT
      }
    });
  }

  if (method === 'GET' && url.pathname === '/api/dashboard') {
    const [customers, catalog, openOrders, sales, conversations] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) total FROM customers WHERE tenant_id = ?').bind(tenantId).first<{ total: number }>(),
      env.DB.prepare('SELECT COUNT(*) total FROM catalog_items WHERE tenant_id = ? AND active = 1').bind(tenantId).first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) total FROM orders WHERE tenant_id = ? AND status NOT IN ('done','cancelled')").bind(tenantId).first<{ total: number }>(),
      env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) total FROM orders WHERE tenant_id = ? AND status != 'cancelled'").bind(tenantId).first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) total FROM conversations WHERE tenant_id = ? AND status IN ('ai','human')").bind(tenantId).first<{ total: number }>()
    ]);

    return json({
      data: {
        customers: customers?.total ?? 0,
        catalogItems: catalog?.total ?? 0,
        openOrders: openOrders?.total ?? 0,
        salesCents: sales?.total ?? 0,
        activeConversations: conversations?.total ?? 0
      }
    });
  }

  if (method === 'GET' && url.pathname === '/api/customers') {
    const result = await env.DB.prepare(`
      SELECT c.id, c.name, c.phone, c.email, c.created_at,
        COUNT(o.id) order_count,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total_cents ELSE 0 END), 0) total_spent_cents,
        MAX(o.created_at) last_order_at
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id AND o.tenant_id = c.tenant_id
      WHERE c.tenant_id = ?
      GROUP BY c.id, c.name, c.phone, c.email, c.created_at
      ORDER BY COALESCE(MAX(o.created_at), c.created_at) DESC
      LIMIT 100
    `).bind(tenantId).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/catalog') {
    const result = await env.DB.prepare(`
      SELECT id, sku, name, description, item_type, category, unit, pricing_mode,
        price_cents, active, stock_control, stock_qty, attributes_json, options_json, image_key
      FROM catalog_items
      WHERE tenant_id = ? AND active = 1
      ORDER BY category, name
    `).bind(tenantId).all();
    return json({ data: result.results });
  }

  if (method === 'POST' && url.pathname === '/api/catalog') {
    const input = await readJsonBody(request);
    const name = stringField(input.name, 'Nome do item', 160, true)!;
    const sku = stringField(input.sku, 'SKU', 80);
    const description = stringField(input.description, 'Descrição', 2000);
    const itemType = enumField(input.item_type, ['product', 'service', 'bundle'] as const, 'product', 'Tipo do item');
    const category = stringField(input.category, 'Categoria', 120);
    const unit = stringField(input.unit, 'Unidade', 24) || 'un';
    const pricingMode = enumField(input.pricing_mode, ['fixed', 'quote', 'formula'] as const, 'fixed', 'Modo de preço');
    const priceCents = moneyCents(input.price_cents, 'Preço');
    const stockControl = input.stock_control === true ? 1 : 0;
    const stockQty = stockControl ? stockQuantity(input.stock_qty) : 0;
    const id = makeId('item');

    await env.DB.prepare(`
      INSERT INTO catalog_items
        (id, tenant_id, sku, name, description, item_type, category, unit, pricing_mode, price_cents,
         active, stock_control, stock_qty, attributes_json, options_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(
      id,
      tenantId,
      sku,
      name,
      description,
      itemType,
      category,
      unit,
      pricingMode,
      priceCents,
      stockControl,
      stockQty,
      safeJson(input.attributes, {}),
      safeJson(input.options, [])
    ).run();

    return json({ data: { id, name } }, 201);
  }

  if (method === 'GET' && url.pathname === '/api/orders') {
    const result = await env.DB.prepare(`
      SELECT o.id, o.public_code, o.transaction_type, o.status, o.source,
        o.total_cents, o.payment_status, o.fulfillment_type, o.created_at,
        c.name customer_name, c.phone customer_phone
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.tenant_id = ?
      ORDER BY o.created_at DESC
      LIMIT 100
    `).bind(tenantId).all();
    return json({ data: result.results });
  }

  if (method === 'POST' && url.pathname === '/api/orders') {
    const input = await readJsonBody(request);
    const rawLines = Array.isArray(input.items) ? input.items : [];
    if (!rawLines.length || rawLines.length > 100) {
      throw new HttpError(400, 'Adicione entre 1 e 100 itens.');
    }

    const customerName = stringField(input.customer_name, 'Nome do cliente', 160) || 'Cliente';
    const phone = stringField(input.customer_phone, 'Telefone', 40);
    const source = stringField(input.source, 'Origem', 40) || 'web';
    const transactionType = enumField(input.transaction_type, ['order', 'quote'] as const, 'order', 'Tipo de transação');
    const fulfillmentType = enumField(input.fulfillment_type, ['pickup', 'delivery', 'service'] as const, 'pickup', 'Forma de atendimento');
    const notes = stringField(input.notes, 'Observações', 3000);

    let customerId: string | null = null;
    if (phone) {
      const found = await env.DB.prepare('SELECT id FROM customers WHERE tenant_id = ? AND phone = ? LIMIT 1')
        .bind(tenantId, phone)
        .first<{ id: string }>();
      customerId = found?.id || null;
    }

    if (!customerId) {
      customerId = makeId('cus');
      await env.DB.prepare('INSERT INTO customers (id, tenant_id, name, phone) VALUES (?, ?, ?, ?)')
        .bind(customerId, tenantId, customerName, phone)
        .run();
    }

    const resolved: Array<{
      id: string;
      catalogId: string;
      name: string;
      qty: number;
      unit: number;
      total: number;
      options: string;
    }> = [];

    for (const rawLine of rawLines) {
      if (!rawLine || typeof rawLine !== 'object' || Array.isArray(rawLine)) {
        throw new HttpError(400, 'Item do pedido inválido.');
      }
      const line = rawLine as Dict;
      const catalogId = stringField(line.catalog_item_id, 'Item do catálogo', 120, true)!;
      const qty = quantity(line.qty);
      const product = await env.DB.prepare(`
        SELECT id, name, price_cents
        FROM catalog_items
        WHERE id = ? AND tenant_id = ? AND active = 1
      `).bind(catalogId, tenantId).first<{ id: string; name: string; price_cents: number }>();

      if (!product) throw new HttpError(400, 'Item do catálogo inválido.');

      const total = Math.round(product.price_cents * qty);
      if (!Number.isSafeInteger(total) || total < 0 || total > MAX_MONEY_CENTS) {
        throw new HttpError(400, 'Total do item inválido.');
      }

      resolved.push({
        id: makeId('line'),
        catalogId,
        name: product.name,
        qty,
        unit: product.price_cents,
        total,
        options: safeJson(line.options, {})
      });
    }

    const orderId = makeId('ord');
    const publicCode = `NJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const subtotal = resolved.reduce((sum, item) => sum + item.total, 0);
    const delivery = moneyCents(input.delivery_cents, 'Frete');
    const discountRequested = moneyCents(input.discount_cents, 'Desconto');
    const discount = Math.min(subtotal + delivery, discountRequested);
    const total = subtotal + delivery - discount;

    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`
        INSERT INTO orders
          (id, tenant_id, customer_id, public_code, source, transaction_type, status, subtotal_cents,
           delivery_cents, discount_cents, total_cents, fulfillment_type, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?)
      `).bind(
        orderId,
        tenantId,
        customerId,
        publicCode,
        source,
        transactionType,
        subtotal,
        delivery,
        discount,
        total,
        fulfillmentType,
        notes
      ),
      env.DB.prepare(`
        INSERT INTO order_events (id, order_id, event_type, to_status, actor_type, actor_id, payload_json)
        VALUES (?, ?, 'order.created', 'new', 'operator', ?, ?)
      `).bind(
        makeId('evt'),
        orderId,
        auth.email || auth.subject || null,
        JSON.stringify({ source })
      )
    ];

    for (const line of resolved) {
      statements.push(
        env.DB.prepare(`
          INSERT INTO order_items
            (id, order_id, catalog_item_id, name, qty, unit_price_cents, total_cents, options_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(line.id, orderId, line.catalogId, line.name, line.qty, line.unit, line.total, line.options)
      );
    }

    await env.DB.batch(statements);
    return json({ data: { id: orderId, public_code: publicCode, status: 'new', total_cents: total } }, 201);
  }

  const statusRoute = url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (method === 'PATCH' && statusRoute) {
    const input = await readJsonBody(request);
    const nextStatus = stringField(input.status, 'Status', 64, true)!;
    if (!(await allowedOrderStatus(env, tenantId, nextStatus))) {
      throw new HttpError(400, 'Status inválido para este tenant.');
    }

    const id = decodeURIComponent(statusRoute[1]);
    const current = await env.DB.prepare('SELECT status FROM orders WHERE id = ? AND tenant_id = ?')
      .bind(id, tenantId)
      .first<{ status: string }>();

    if (!current) throw new HttpError(404, 'Pedido não encontrado.');

    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
        .bind(nextStatus, id, tenantId),
      env.DB.prepare(`
        INSERT INTO order_events
          (id, order_id, event_type, from_status, to_status, actor_type, actor_id)
        VALUES (?, ?, ?, ?, ?, 'operator', ?)
      `).bind(makeId('evt'), id, 'order.status.changed', current.status, nextStatus, auth.email || auth.subject || null)
    ]);

    return json({ data: { id, from: current.status, status: nextStatus } });
  }

  if (method === 'GET' && url.pathname === '/api/workflows') {
    const result = await env.DB.prepare(`
      SELECT wt.id workflow_id, wt.name workflow_name, wt.transaction_type,
        ws.id step_id, ws.step_key, ws.label, ws.sort_order, ws.color, ws.customer_message
      FROM workflow_templates wt
      LEFT JOIN workflow_steps ws ON ws.workflow_id = wt.id
      WHERE wt.tenant_id = ?
      ORDER BY wt.name, ws.sort_order
    `).bind(tenantId).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/automations') {
    const result = await env.DB.prepare(`
      SELECT id, name, trigger_type, action_type, active, created_at
      FROM automation_rules
      WHERE tenant_id = ?
      ORDER BY created_at DESC
    `).bind(tenantId).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/conversations') {
    const result = await env.DB.prepare(`
      SELECT cv.id, cv.status, cv.external_id, cv.last_message_at,
        ch.channel_type, ch.name channel_name, c.name customer_name, c.phone customer_phone
      FROM conversations cv
      LEFT JOIN channels ch ON ch.id = cv.channel_id
      LEFT JOIN customers c ON c.id = cv.customer_id
      WHERE cv.tenant_id = ?
      ORDER BY COALESCE(cv.last_message_at, cv.created_at) DESC
      LIMIT 100
    `).bind(tenantId).all();
    return json({ data: result.results });
  }

  const takeoverRoute = url.pathname.match(/^\/api\/conversations\/([^/]+)\/takeover$/);
  if (method === 'POST' && takeoverRoute) {
    const input = await readJsonBody(request);
    const mode = enumField(input.mode, ['ai', 'human'] as const, 'human', 'Modo');
    const conversationId = decodeURIComponent(takeoverRoute[1]);

    const result = await env.DB.prepare(`
      UPDATE conversations
      SET status = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(mode, conversationId, tenantId).run();

    if (!result.meta.changes) throw new HttpError(404, 'Conversa não encontrada.');
    return json({ data: { id: conversationId, status: mode } });
  }

  return json({ error: 'Endpoint não encontrado.' }, 404);
}

async function serveApp(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === '/' || url.pathname === '/app' || url.pathname === '/app/') {
    return env.ASSETS.fetch(new Request(new URL('/app.html', url.origin), request));
  }
  return env.ASSETS.fetch(request);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();

  if (isProduction(env)) {
    if (PUBLIC_HOSTS.has(hostname)) {
      if (url.pathname === '/app' || url.pathname === '/app/') return redirectToApp();
      if (url.pathname.startsWith('/api/')) return notFound(false);
      return secureResponse(await env.ASSETS.fetch(request), false);
    }

    if (hostname !== APP_HOST) {
      return notFound(false);
    }

    const auth = await authForRequest(request, env);
    const apiResponse = await handleApi(request, env, url, auth);
    if (apiResponse) return secureResponse(apiResponse, true);
    return secureResponse(await serveApp(request, env, url), true);
  }

  if (isHml(env)) {
    if (!hmlAuthorized(request, env)) return hmlChallenge();
    const auth = localAuth(env);
    const apiResponse = await handleApi(request, env, url, auth);
    if (apiResponse) return secureResponse(apiResponse, true);
    return secureResponse(await serveApp(request, env, url), true);
  }

  const auth = localAuth(env);
  const apiResponse = await handleApi(request, env, url, auth);
  if (apiResponse) return secureResponse(apiResponse, true);
  if (url.pathname === '/app' || url.pathname === '/app/' || url.pathname.startsWith('/app.')) {
    return secureResponse(await serveApp(request, env, url), true);
  }
  return secureResponse(await env.ASSETS.fetch(request), false);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return secureResponse(json({ error: error.message }, error.status), true);
      }

      console.error('NegocIAJá error', error);
      const url = new URL(request.url);
      return secureResponse(
        url.pathname.startsWith('/api/')
          ? json({ error: 'Erro interno.', requestId: crypto.randomUUID() }, 500)
          : new Response('NegocIAJá temporariamente indisponível.', {
              status: 500,
              headers: { 'content-type': 'text/plain; charset=utf-8' }
            }),
        url.hostname === APP_HOST || isHml(env) || url.pathname.startsWith('/api/')
      );
    }
  }
};
