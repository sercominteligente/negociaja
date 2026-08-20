import platform from './platform';

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

type Session = {
  tenant_id?: string;
  global_role?: string;
  role?: string;
  email?: string;
};

type Dict = Record<string, unknown>;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);
const bool = (value: unknown) => value === true || value === 1 || value === '1';

async function sessionFor(request: Request, env: Env): Promise<{ response?: Response; session?: Session }> {
  const sessionUrl = new URL('/api/session', request.url);
  const sessionRequest = new Request(sessionUrl.toString(), {
    method: 'GET',
    headers: request.headers
  });
  const response = await platform.fetch(sessionRequest, env);
  if (!response.ok) return { response };
  const payload = await response.clone().json().catch(() => ({})) as { data?: Session };
  return { session: payload.data || {} };
}

function ensureAdmin(session: Session) {
  const allowed = session.global_role === 'super_admin' || session.role === 'owner' || session.role === 'admin';
  if (!allowed) throw new Error('forbidden');
}

async function readBody(request: Request): Promise<Dict> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('application/json')) throw new Response(JSON.stringify({ error: 'Envie application/json.' }), { status: 415, headers: { 'content-type': 'application/json' } });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new Response(JSON.stringify({ error: 'Origem não autorizada.' }), { status: 403, headers: { 'content-type': 'application/json' } });
  const value = await request.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Response(JSON.stringify({ error: 'JSON inválido.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  return value as Dict;
}

async function getCompanySettings(env: Env, tenantId: string) {
  const [tenant, business, branding, catalog, portal, numbering, templates] = await Promise.all([
    env.DB.prepare('SELECT id, name, slug, segment, status FROM tenants WHERE id=? LIMIT 1').bind(tenantId).first(),
    env.DB.prepare('SELECT * FROM tenant_business_profile WHERE tenant_id=? LIMIT 1').bind(tenantId).first(),
    env.DB.prepare('SELECT * FROM tenant_branding WHERE tenant_id=? LIMIT 1').bind(tenantId).first(),
    env.DB.prepare('SELECT * FROM catalog_presentation WHERE tenant_id=? LIMIT 1').bind(tenantId).first(),
    env.DB.prepare('SELECT * FROM tenant_portal_settings WHERE tenant_id=? LIMIT 1').bind(tenantId).first(),
    env.DB.prepare('SELECT document_type,prefix,suffix,next_number,padding,reset_policy FROM document_numbering WHERE tenant_id=? ORDER BY document_type').bind(tenantId).all(),
    env.DB.prepare('SELECT id,document_type,name,active,is_default,show_logo,show_company_data,show_customer_data,show_signature,show_payment_terms,header_json,body_json,footer_json,style_json FROM document_templates WHERE tenant_id=? ORDER BY document_type,name').bind(tenantId).all()
  ]);
  return { tenant, business, branding, catalog, portal, numbering: numbering.results, templates: templates.results };
}

async function saveCompanySettings(request: Request, env: Env, tenantId: string, email: string) {
  const input = await readBody(request);
  const business = (input.business && typeof input.business === 'object' ? input.business : {}) as Dict;
  const branding = (input.branding && typeof input.branding === 'object' ? input.branding : {}) as Dict;
  const catalog = (input.catalog && typeof input.catalog === 'object' ? input.catalog : {}) as Dict;
  const portal = (input.portal && typeof input.portal === 'object' ? input.portal : {}) as Dict;

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO tenant_business_profile
      (tenant_id,legal_name,trade_name,document_number,state_registration,municipal_registration,email,phone,whatsapp,website,postal_code,street,number,complement,district,city,state,country,payment_instructions,terms_text,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET legal_name=excluded.legal_name,trade_name=excluded.trade_name,document_number=excluded.document_number,state_registration=excluded.state_registration,municipal_registration=excluded.municipal_registration,email=excluded.email,phone=excluded.phone,whatsapp=excluded.whatsapp,website=excluded.website,postal_code=excluded.postal_code,street=excluded.street,number=excluded.number,complement=excluded.complement,district=excluded.district,city=excluded.city,state=excluded.state,country=excluded.country,payment_instructions=excluded.payment_instructions,terms_text=excluded.terms_text,updated_at=datetime('now')`)
      .bind(tenantId,clean(business.legal_name,180)||null,clean(business.trade_name,180)||null,clean(business.document_number,40)||null,clean(business.state_registration,60)||null,clean(business.municipal_registration,60)||null,clean(business.email,254)||null,clean(business.phone,40)||null,clean(business.whatsapp,40)||null,clean(business.website,240)||null,clean(business.postal_code,20)||null,clean(business.street,180)||null,clean(business.number,30)||null,clean(business.complement,120)||null,clean(business.district,120)||null,clean(business.city,120)||null,clean(business.state,40)||null,clean(business.country,2)||'BR',clean(business.payment_instructions,2000)||null,clean(business.terms_text,5000)||null),

    env.DB.prepare(`INSERT INTO tenant_branding
      (tenant_id,logo_key,logo_dark_key,favicon_key,primary_color,secondary_color,accent_color,background_color,text_color,font_family,border_radius,company_display_name,slogan,footer_text,show_negociaja_brand,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET logo_key=excluded.logo_key,logo_dark_key=excluded.logo_dark_key,favicon_key=excluded.favicon_key,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,accent_color=excluded.accent_color,background_color=excluded.background_color,text_color=excluded.text_color,font_family=excluded.font_family,border_radius=excluded.border_radius,company_display_name=excluded.company_display_name,slogan=excluded.slogan,footer_text=excluded.footer_text,show_negociaja_brand=excluded.show_negociaja_brand,updated_at=datetime('now')`)
      .bind(tenantId,clean(branding.logo_key,500)||null,clean(branding.logo_dark_key,500)||null,clean(branding.favicon_key,500)||null,clean(branding.primary_color,20)||'#169CFF',clean(branding.secondary_color,20)||'#0B2B7C',clean(branding.accent_color,20)||'#FFC107',clean(branding.background_color,20)||'#FFFFFF',clean(branding.text_color,20)||'#071A43',clean(branding.font_family,120)||null,clean(branding.border_radius,20)||'14px',clean(branding.company_display_name,180)||null,clean(branding.slogan,240)||null,clean(branding.footer_text,500)||null,bool(branding.show_negociaja_brand)?1:0),

    env.DB.prepare(`INSERT INTO catalog_presentation
      (tenant_id,layout,hero_image_key,hero_title,hero_subtitle,show_prices,show_stock,show_categories,card_style,catalog_title,catalog_description,custom_domain,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET layout=excluded.layout,hero_image_key=excluded.hero_image_key,hero_title=excluded.hero_title,hero_subtitle=excluded.hero_subtitle,show_prices=excluded.show_prices,show_stock=excluded.show_stock,show_categories=excluded.show_categories,card_style=excluded.card_style,catalog_title=excluded.catalog_title,catalog_description=excluded.catalog_description,custom_domain=excluded.custom_domain,updated_at=datetime('now')`)
      .bind(tenantId,['grid','list','compact'].includes(clean(catalog.layout,20))?clean(catalog.layout,20):'grid',clean(catalog.hero_image_key,500)||null,clean(catalog.hero_title,240)||null,clean(catalog.hero_subtitle,500)||null,bool(catalog.show_prices)?1:0,bool(catalog.show_stock)?1:0,bool(catalog.show_categories)?1:0,['default','soft','bordered','minimal'].includes(clean(catalog.card_style,20))?clean(catalog.card_style,20):'default',clean(catalog.catalog_title,180)||null,clean(catalog.catalog_description,1500)||null,clean(catalog.custom_domain,240)||null),

    env.DB.prepare(`INSERT INTO tenant_portal_settings
      (tenant_id,dashboard_welcome_title,dashboard_welcome_text,login_background_key,login_message,support_label,updated_at)
      VALUES (?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET dashboard_welcome_title=excluded.dashboard_welcome_title,dashboard_welcome_text=excluded.dashboard_welcome_text,login_background_key=excluded.login_background_key,login_message=excluded.login_message,support_label=excluded.support_label,updated_at=datetime('now')`)
      .bind(tenantId,clean(portal.dashboard_welcome_title,180)||null,clean(portal.dashboard_welcome_text,700)||null,clean(portal.login_background_key,500)||null,clean(portal.login_message,500)||null,clean(portal.support_label,80)||'Ajuda IA'),

    env.DB.prepare(`INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,payload_json)
      VALUES (?,?, 'operator', ?, 'tenant.customization.updated', 'tenant', ?, ?)`)
      .bind(`audit_${crypto.randomUUID()}`,tenantId,email||null,tenantId,JSON.stringify({ sections:['business','branding','catalog','portal'] }))
  ];

  await env.DB.batch(statements);
  return getCompanySettings(env, tenantId);
}

async function saveNumbering(request: Request, env: Env, tenantId: string) {
  const input = await readBody(request);
  const documentType = clean(input.document_type,30);
  if (!['quote','order','receipt','invoice'].includes(documentType)) return json({ error: 'Tipo de documento inválido.' }, 400);
  const prefix = clean(input.prefix,30);
  const suffix = clean(input.suffix,30);
  const padding = Math.max(1,Math.min(10,Math.round(Number(input.padding||5))));
  const reset = ['never','yearly','monthly'].includes(clean(input.reset_policy,20))?clean(input.reset_policy,20):'never';
  await env.DB.prepare(`INSERT INTO document_numbering (tenant_id,document_type,prefix,suffix,next_number,padding,reset_policy,updated_at)
    VALUES (?,?,?,?,1,?,?,datetime('now'))
    ON CONFLICT(tenant_id,document_type) DO UPDATE SET prefix=excluded.prefix,suffix=excluded.suffix,padding=excluded.padding,reset_policy=excluded.reset_policy,updated_at=datetime('now')`)
    .bind(tenantId,documentType,prefix||null,suffix||null,padding,reset).run();
  return getCompanySettings(env, tenantId);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/company-settings' || url.pathname === '/api/company-settings/numbering') {
        const auth = await sessionFor(request, env);
        if (auth.response) return auth.response;
        const session = auth.session || {};
        try { ensureAdmin(session); } catch { return json({ error: 'Apenas administradores da empresa podem alterar a personalização.' }, 403); }
        const tenantId = session.tenant_id || env.DEFAULT_TENANT_ID;
        if (!tenantId) return json({ error: 'Tenant indisponível.' }, 403);
        if (request.method === 'GET' && url.pathname === '/api/company-settings') return json({ data: await getCompanySettings(env, tenantId) });
        if (request.method === 'PUT' && url.pathname === '/api/company-settings') return json({ data: await saveCompanySettings(request, env, tenantId, session.email || '') });
        if (request.method === 'PUT' && url.pathname === '/api/company-settings/numbering') return json({ data: await saveNumbering(request, env, tenantId) });
        return json({ error: 'Método não permitido.' }, 405);
      }
      return platform.fetch(request, env);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error('HML white-label gateway error', error);
      return json({ error: 'Erro interno da homologação.' }, 500);
    }
  }
};
