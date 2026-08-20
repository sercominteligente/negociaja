import core from './index';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_ENVIRONMENT: string;
  DEFAULT_TENANT_ID: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  HML_USERNAME?: string;
  HML_PASSWORD?: string;
}

type Dict = Record<string, unknown>;
type GlobalRole = 'super_admin' | 'support' | 'member';
type TenantRole = 'owner' | 'admin' | 'manager' | 'operator' | 'viewer';

type Identity = {
  email: string;
  subject?: string;
  platformUserId?: string;
  globalRole: GlobalRole;
  tenantId?: string;
  tenantRole?: TenantRole;
  permissions: string[];
};

class PlatformError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const APP_HOST = 'app.negociaja.com.br';
const MAX_BODY = 64 * 1024;
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const isHml = (env: Env) => env.APP_ENVIRONMENT === 'hml';
const isProduction = (env: Env) => env.APP_ENVIRONMENT === 'production';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

function secure(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function hmlAuthorized(request: Request, env: Env): boolean {
  if (!env.HML_PASSWORD) return false;
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Basic ')) return false;
  try {
    const decoded = atob(auth.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    return decoded.slice(0, separator) === (env.HML_USERNAME || 'homologacao') && decoded.slice(separator + 1) === env.HML_PASSWORD;
  } catch {
    return false;
  }
}

function jwks(teamDomain: string) {
  const base = teamDomain.replace(/\/+$/, '');
  const url = `${base}/cdn-cgi/access/certs`;
  let value = jwksCache.get(url);
  if (!value) {
    value = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, value);
  }
  return value;
}

async function accessPayload(request: Request, env: Env): Promise<JWTPayload> {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new PlatformError(403, 'Acesso não autorizado.');
  const issuer = env.ACCESS_TEAM_DOMAIN.replace(/\/+$/, '');
  try {
    const { payload } = await jwtVerify(token, jwks(issuer), {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256']
    });
    return payload;
  } catch {
    throw new PlatformError(403, 'Sessão de acesso inválida.');
  }
}

async function baseEmail(request: Request, env: Env): Promise<{ email: string; subject?: string }> {
  if (isHml(env)) {
    if (!hmlAuthorized(request, env)) throw new PlatformError(401, 'Autenticação de homologação necessária.');
    return { email: 'local@negociaja.invalid', subject: 'hml-basic' };
  }
  if (isProduction(env)) {
    const payload = await accessPayload(request, env);
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    if (!email) throw new PlatformError(403, 'E-mail de acesso indisponível.');
    return { email, subject: typeof payload.sub === 'string' ? payload.sub : undefined };
  }
  return { email: 'local@negociaja.invalid', subject: 'local-dev' };
}

async function identityFor(request: Request, env: Env, allowPlatform = false): Promise<Identity> {
  const base = await baseEmail(request, env);
  const user = await env.DB.prepare(`
    SELECT id, email, global_role, status
    FROM platform_users
    WHERE lower(email) = lower(?)
    LIMIT 1
  `).bind(base.email).first<{ id: string; email: string; global_role: GlobalRole; status: string }>();

  if (!user || user.status !== 'active') {
    if (allowPlatform) throw new PlatformError(403, 'Usuário não autorizado na plataforma.');
    throw new PlatformError(403, 'Usuário sem acesso a uma empresa ativa.');
  }

  if (allowPlatform) {
    if (user.global_role !== 'super_admin' && user.global_role !== 'support') {
      throw new PlatformError(403, 'Acesso restrito ao Super Admin.');
    }
    return { email: user.email, subject: base.subject, platformUserId: user.id, globalRole: user.global_role, permissions: ['platform.read'] };
  }

  const requestedTenant = (request.headers.get('x-negociaja-context') || '').trim();
  if (user.global_role === 'super_admin' && requestedTenant) {
    const tenant = await env.DB.prepare('SELECT id, status FROM tenants WHERE id = ? LIMIT 1').bind(requestedTenant).first<{ id: string; status: string }>();
    if (!tenant || tenant.status !== 'active') throw new PlatformError(403, 'Empresa indisponível.');
    return {
      email: user.email,
      subject: base.subject,
      platformUserId: user.id,
      globalRole: user.global_role,
      tenantId: tenant.id,
      tenantRole: 'owner',
      permissions: ['*']
    };
  }

  const membership = await env.DB.prepare(`
    SELECT tm.tenant_id, tm.role, tm.permissions_json, tm.status, t.status tenant_status
    FROM tenant_memberships tm
    INNER JOIN tenants t ON t.id = tm.tenant_id
    WHERE tm.platform_user_id = ?
      AND tm.status = 'active'
      AND t.status = 'active'
      AND (? = '' OR tm.tenant_id = ?)
    ORDER BY CASE tm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 WHEN 'operator' THEN 4 ELSE 5 END
    LIMIT 1
  `).bind(user.id, requestedTenant, requestedTenant).first<{ tenant_id: string; role: TenantRole; permissions_json: string; status: string; tenant_status: string }>();

  if (!membership) throw new PlatformError(403, 'Nenhuma empresa ativa associada ao usuário.');
  let permissions: string[] = [];
  try { permissions = JSON.parse(membership.permissions_json || '[]'); } catch { permissions = []; }
  return {
    email: user.email,
    subject: base.subject,
    platformUserId: user.id,
    globalRole: user.global_role,
    tenantId: membership.tenant_id,
    tenantRole: membership.role,
    permissions
  };
}

function tenantPermission(identity: Identity, method: string, path: string): boolean {
  if (identity.globalRole === 'super_admin' || identity.permissions.includes('*')) return true;
  if (identity.tenantRole === 'owner' || identity.tenantRole === 'admin') return true;
  if (identity.tenantRole === 'viewer') return method === 'GET';
  if (identity.tenantRole === 'manager') {
    if (method === 'DELETE') return false;
    return !path.startsWith('/api/platform/');
  }
  if (identity.tenantRole === 'operator') {
    if (method === 'GET') return true;
    if (method === 'POST' && (path === '/api/orders' || /\/api\/conversations\/[^/]+\/takeover$/.test(path))) return true;
    if (method === 'PATCH' && /\/api\/orders\/[^/]+\/status$/.test(path)) return true;
    return false;
  }
  return false;
}

function ensureMutation(request: Request, env: Env): void {
  const method = request.method.toUpperCase();
  if (!['POST','PUT','PATCH','DELETE'].includes(method)) return;
  const origin = request.headers.get('origin');
  if (isProduction(env) && origin !== `https://${APP_HOST}`) throw new PlatformError(403, 'Origem não autorizada.');
  if (isHml(env) && origin !== new URL(request.url).origin) throw new PlatformError(403, 'Origem não autorizada.');
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new PlatformError(415, 'Envie application/json.');
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY) throw new PlatformError(413, 'Corpo muito grande.');
}

async function body(request: Request): Promise<Dict> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY) throw new PlatformError(413, 'Corpo muito grande.');
  try {
    const value = bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new PlatformError(400, 'JSON inválido.');
  }
}

const clean = (value: unknown, max = 180) => String(value ?? '').trim().slice(0, max);
const activeInt = (value: unknown) => value === true || value === 1 || value === '1' ? 1 : 0;

async function platformApi(request: Request, env: Env, url: URL, identity: Identity): Promise<Response> {
  const method = request.method.toUpperCase();
  ensureMutation(request, env);

  if (method === 'GET' && url.pathname === '/api/platform/session') {
    return json({ data: { email: identity.email, global_role: identity.globalRole, environment: env.APP_ENVIRONMENT } });
  }

  if (method === 'GET' && url.pathname === '/api/platform/overview') {
    const [tenants, activeTenants, users, subscriptions, agents, channels, ai, billing, degraded] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) total FROM tenants').first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) total FROM tenants WHERE status = 'active'").first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) total FROM platform_users WHERE status = 'active'").first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) total FROM tenant_subscriptions WHERE status IN ('trialing','active')").first<{ total: number }>(),
      env.DB.prepare('SELECT COUNT(*) total FROM agent_profiles WHERE active = 1').first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) total FROM channels WHERE status != 'disconnected'").first<{ total: number }>(),
      env.DB.prepare('SELECT COALESCE(SUM(estimated_cost_micros),0) total FROM ai_usage_events').first<{ total: number }>(),
      env.DB.prepare("SELECT COALESCE(SUM(amount_cents),0) total FROM platform_billing_events WHERE status = 'paid'").first<{ total: number }>(),
      env.DB.prepare("SELECT COUNT(*) total FROM integration_health_checks WHERE status IN ('degraded','down') AND checked_at >= datetime('now','-24 hour')").first<{ total: number }>()
    ]);
    return json({ data: {
      tenants: tenants?.total ?? 0,
      active_tenants: activeTenants?.total ?? 0,
      users: users?.total ?? 0,
      subscriptions: subscriptions?.total ?? 0,
      agents: agents?.total ?? 0,
      connected_channels: channels?.total ?? 0,
      ai_cost_micros: ai?.total ?? 0,
      platform_revenue_cents: billing?.total ?? 0,
      unhealthy_integrations: degraded?.total ?? 0
    }});
  }

  if (method === 'GET' && url.pathname === '/api/platform/tenants') {
    const result = await env.DB.prepare(`
      SELECT t.id, t.slug, t.name, t.segment, t.status, t.created_at,
        p.name plan_name, p.slug plan_slug, s.status subscription_status,
        (SELECT COUNT(*) FROM tenant_memberships tm WHERE tm.tenant_id = t.id AND tm.status='active') users_count,
        (SELECT COUNT(*) FROM channels ch WHERE ch.tenant_id = t.id) channels_count,
        (SELECT COUNT(*) FROM agent_profiles ap WHERE ap.tenant_id = t.id AND ap.active=1) agents_count,
        (SELECT COALESCE(SUM(o.total_cents),0) FROM orders o WHERE o.tenant_id=t.id AND o.status!='cancelled') sales_cents
      FROM tenants t
      LEFT JOIN tenant_subscriptions s ON s.tenant_id = t.id
      LEFT JOIN plans p ON p.id = s.plan_id
      ORDER BY t.created_at DESC
    `).all();
    return json({ data: result.results });
  }

  if (method === 'POST' && url.pathname === '/api/platform/tenants') {
    const input = await body(request);
    const name = clean(input.name, 160);
    const slug = clean(input.slug, 80).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const segment = clean(input.segment, 80) || 'custom';
    const planId = clean(input.plan_id, 100) || 'plan_start';
    if (!name || !slug) throw new PlatformError(400, 'Nome e slug são obrigatórios.');
    const tenantId = id('tenant');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO tenants (id, slug, name, segment, status) VALUES (?, ?, ?, ?, ?)').bind(tenantId, slug, name, segment, 'active'),
      env.DB.prepare('INSERT INTO tenant_settings (tenant_id, public_name) VALUES (?, ?)').bind(tenantId, name),
      env.DB.prepare('INSERT INTO tenant_subscriptions (id, tenant_id, plan_id, status, trial_ends_at) VALUES (?, ?, ?, ?, datetime(\'now\',\'+14 day\'))').bind(id('sub'), tenantId, planId, 'trialing'),
      env.DB.prepare(`INSERT INTO audit_logs (id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, payload_json)
        VALUES (?, ?, 'super_admin', ?, 'tenant.created', 'tenant', ?, ?)`)
        .bind(id('audit'), tenantId, identity.email, tenantId, JSON.stringify({ plan_id: planId }))
    ]);
    return json({ data: { id: tenantId, name, slug, status: 'active' } }, 201);
  }

  const tenantStatus = url.pathname.match(/^\/api\/platform\/tenants\/([^/]+)\/status$/);
  if (method === 'PATCH' && tenantStatus) {
    const input = await body(request);
    const status = clean(input.status, 20);
    if (!['active','blocked','suspended'].includes(status)) throw new PlatformError(400, 'Status inválido.');
    const tenantId = decodeURIComponent(tenantStatus[1]);
    await env.DB.batch([
      env.DB.prepare('UPDATE tenants SET status = ? WHERE id = ?').bind(status, tenantId),
      env.DB.prepare(`INSERT INTO audit_logs (id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, payload_json)
        VALUES (?, ?, 'super_admin', ?, 'tenant.status.changed', 'tenant', ?, ?)`)
        .bind(id('audit'), tenantId, identity.email, tenantId, JSON.stringify({ status }))
    ]);
    return json({ data: { id: tenantId, status } });
  }

  if (method === 'GET' && url.pathname === '/api/platform/plans') {
    const result = await env.DB.prepare('SELECT * FROM plans ORDER BY price_monthly_cents, name').all();
    return json({ data: result.results });
  }

  if (method === 'POST' && url.pathname === '/api/platform/plans') {
    const input = await body(request);
    const name = clean(input.name, 120);
    const slug = clean(input.slug, 80).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!name || !slug) throw new PlatformError(400, 'Nome e slug são obrigatórios.');
    const planId = id('plan');
    const monthly = Math.max(0, Math.round(Number(input.price_monthly_cents || 0)));
    await env.DB.prepare(`INSERT INTO plans (id, slug, name, description, price_monthly_cents, price_yearly_cents, limits_json, features_json, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .bind(planId, slug, name, clean(input.description, 1000), monthly, Math.max(0, Math.round(Number(input.price_yearly_cents || 0))), JSON.stringify(input.limits || {}), JSON.stringify(input.features || [])).run();
    return json({ data: { id: planId, name, slug } }, 201);
  }

  if (method === 'GET' && url.pathname === '/api/platform/subscriptions') {
    const result = await env.DB.prepare(`
      SELECT s.id, s.status, s.started_at, s.trial_ends_at, s.current_period_end,
        t.id tenant_id, t.name tenant_name, p.id plan_id, p.name plan_name, p.price_monthly_cents
      FROM tenant_subscriptions s
      INNER JOIN tenants t ON t.id=s.tenant_id
      INNER JOIN plans p ON p.id=s.plan_id
      ORDER BY s.updated_at DESC
    `).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/platform/users') {
    const result = await env.DB.prepare(`
      SELECT pu.id, pu.name, pu.email, pu.global_role, pu.status, pu.created_at,
        GROUP_CONCAT(t.name || ':' || tm.role, ' | ') memberships
      FROM platform_users pu
      LEFT JOIN tenant_memberships tm ON tm.platform_user_id=pu.id
      LEFT JOIN tenants t ON t.id=tm.tenant_id
      GROUP BY pu.id
      ORDER BY pu.created_at DESC
    `).all();
    return json({ data: result.results });
  }

  if (method === 'POST' && url.pathname === '/api/platform/users') {
    const input = await body(request);
    const email = clean(input.email, 254).toLowerCase();
    const name = clean(input.name, 160);
    const globalRole = clean(input.global_role, 30) || 'member';
    const tenantId = clean(input.tenant_id, 120);
    const role = clean(input.role, 30) || 'operator';
    if (!email || !name) throw new PlatformError(400, 'Nome e e-mail são obrigatórios.');
    if (!['super_admin','support','member'].includes(globalRole)) throw new PlatformError(400, 'Papel global inválido.');
    if (!['owner','admin','manager','operator','viewer'].includes(role)) throw new PlatformError(400, 'Papel da empresa inválido.');
    let platformUser = await env.DB.prepare('SELECT id FROM platform_users WHERE lower(email)=lower(?)').bind(email).first<{ id: string }>();
    const userId = platformUser?.id || id('puser');
    if (!platformUser) await env.DB.prepare('INSERT INTO platform_users (id,email,name,global_role,status) VALUES (?,?,?,?,?)').bind(userId,email,name,globalRole,'active').run();
    if (tenantId) {
      await env.DB.prepare(`INSERT OR REPLACE INTO tenant_memberships (id,tenant_id,platform_user_id,role,permissions_json,status,updated_at)
        VALUES (COALESCE((SELECT id FROM tenant_memberships WHERE tenant_id=? AND platform_user_id=?),?),?,?,?,'[]','active',datetime('now'))`)
        .bind(tenantId,userId,id('membership'),tenantId,userId,role).run();
    }
    return json({ data: { id: userId, email, tenant_id: tenantId || null, role } }, 201);
  }

  if (method === 'GET' && url.pathname === '/api/platform/agents') {
    const result = await env.DB.prepare(`SELECT ap.id, ap.name, ap.role, ap.model_provider, ap.model_name, ap.active, ap.created_at, t.name tenant_name, t.id tenant_id
      FROM agent_profiles ap INNER JOIN tenants t ON t.id=ap.tenant_id ORDER BY ap.created_at DESC`).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/platform/channels') {
    const result = await env.DB.prepare(`SELECT ch.id, ch.channel_type, ch.name, ch.status, ch.created_at, t.name tenant_name, t.id tenant_id
      FROM channels ch INNER JOIN tenants t ON t.id=ch.tenant_id ORDER BY ch.created_at DESC`).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/platform/integrations') {
    const result = await env.DB.prepare(`SELECT i.id, i.provider, i.status, i.updated_at, t.name tenant_name, t.id tenant_id,
      (SELECT h.status FROM integration_health_checks h WHERE h.integration_id=i.id ORDER BY h.checked_at DESC LIMIT 1) health_status
      FROM integrations i INNER JOIN tenants t ON t.id=i.tenant_id ORDER BY i.updated_at DESC`).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/platform/usage') {
    const result = await env.DB.prepare(`SELECT a.tenant_id, t.name tenant_name, a.modality,
      COUNT(*) requests, SUM(a.input_units) input_units, SUM(a.output_units) output_units, SUM(a.estimated_cost_micros) cost_micros
      FROM ai_usage_events a INNER JOIN tenants t ON t.id=a.tenant_id
      GROUP BY a.tenant_id, t.name, a.modality ORDER BY cost_micros DESC`).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/platform/billing') {
    const result = await env.DB.prepare(`SELECT b.*, t.name tenant_name FROM platform_billing_events b INNER JOIN tenants t ON t.id=b.tenant_id ORDER BY b.created_at DESC LIMIT 200`).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/platform/logs') {
    const result = await env.DB.prepare(`SELECT a.*, t.name tenant_name FROM audit_logs a LEFT JOIN tenants t ON t.id=a.tenant_id ORDER BY a.created_at DESC LIMIT 250`).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/platform/health') {
    const result = await env.DB.prepare(`SELECT h.*, t.name tenant_name FROM integration_health_checks h LEFT JOIN tenants t ON t.id=h.tenant_id ORDER BY h.checked_at DESC LIMIT 200`).all();
    return json({ data: result.results });
  }

  if (method === 'GET' && url.pathname === '/api/platform/settings') {
    const [settings, flags] = await Promise.all([
      env.DB.prepare('SELECT * FROM global_settings ORDER BY setting_key').all(),
      env.DB.prepare('SELECT * FROM feature_flags ORDER BY flag_key').all()
    ]);
    return json({ data: { settings: settings.results, flags: flags.results } });
  }

  if (method === 'POST' && url.pathname === '/api/platform/health/check') {
    const input = await body(request);
    const component = clean(input.component, 120) || 'manual';
    const status = clean(input.status, 20) || 'healthy';
    if (!['healthy','degraded','down','unknown'].includes(status)) throw new PlatformError(400, 'Status inválido.');
    const healthId = id('health');
    await env.DB.prepare(`INSERT INTO integration_health_checks (id,tenant_id,component,status,latency_ms,message,metadata_json)
      VALUES (?,?,?,?,?,?,?)`).bind(healthId, clean(input.tenant_id,120)||null, component, status, Math.max(0,Math.round(Number(input.latency_ms||0))), clean(input.message,500)||null, JSON.stringify(input.metadata||{})).run();
    return json({ data: { id: healthId, status } }, 201);
  }

  return json({ error: 'Endpoint de plataforma não encontrado.' }, 404);
}

async function tenantSession(env: Env, identity: Identity) {
  const memberships = identity.platformUserId ? await env.DB.prepare(`
    SELECT tm.tenant_id, tm.role, tm.permissions_json, t.name tenant_name, t.slug tenant_slug
    FROM tenant_memberships tm INNER JOIN tenants t ON t.id=tm.tenant_id
    WHERE tm.platform_user_id=? AND tm.status='active' AND t.status='active'
    ORDER BY t.name
  `).bind(identity.platformUserId).all() : { results: [] };
  return json({ data: {
    tenant_id: identity.tenantId,
    email: identity.email,
    global_role: identity.globalRole,
    role: identity.tenantRole,
    permissions: identity.permissions,
    memberships: memberships.results,
    environment: env.APP_ENVIRONMENT
  }});
}

async function serveSuperAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  await identityFor(request, env, true);
  if (url.pathname === '/super-admin' || url.pathname === '/super-admin/') {
    return env.ASSETS.fetch(new Request(new URL('/super-admin.html', url.origin), request));
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith('/api/platform/')) {
        const identity = await identityFor(request, env, true);
        return secure(await platformApi(request, env, url, identity));
      }

      if (url.pathname === '/super-admin' || url.pathname === '/super-admin/' || url.pathname.startsWith('/super-admin.')) {
        return secure(await serveSuperAdmin(request, env, url));
      }

      if (url.pathname === '/api/session') {
        const identity = await identityFor(request, env, false);
        return secure(await tenantSession(env, identity));
      }

      if (url.pathname.startsWith('/api/')) {
        const identity = await identityFor(request, env, false);
        if (!tenantPermission(identity, request.method.toUpperCase(), url.pathname)) {
          throw new PlatformError(403, 'Seu perfil não possui permissão para esta ação.');
        }
        const scopedEnv = { ...env, DEFAULT_TENANT_ID: identity.tenantId || env.DEFAULT_TENANT_ID };
        return await core.fetch(request, scopedEnv);
      }

      if (url.pathname === '/' || url.pathname === '/app' || url.pathname === '/app/' || url.pathname.startsWith('/app.')) {
        const identity = await identityFor(request, env, false);
        const scopedEnv = { ...env, DEFAULT_TENANT_ID: identity.tenantId || env.DEFAULT_TENANT_ID };
        return await core.fetch(request, scopedEnv);
      }

      return await core.fetch(request, env);
    } catch (error) {
      if (error instanceof PlatformError) return secure(json({ error: error.message }, error.status));
      console.error('NegocIAJá platform gateway error', error);
      return secure(json({ error: 'Erro interno de plataforma.', requestId: crypto.randomUUID() }, 500));
    }
  }
};
