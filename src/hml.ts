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

const MAX_JSON_BYTES = 64 * 1024;
const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const ALLOWED_ASSETS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);
const bool = (value: unknown) => value === true || value === 1 || value === '1';
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

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

function ensureSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new Response(JSON.stringify({ error: 'Origem não autorizada.' }), { status: 403, headers: { 'content-type': 'application/json' } });
}

async function readBody(request: Request): Promise<Dict> {
  ensureSameOrigin(request);
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('application/json')) throw new Response(JSON.stringify({ error: 'Envie application/json.' }), { status: 415, headers: { 'content-type': 'application/json' } });
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_JSON_BYTES) throw new Response(JSON.stringify({ error: 'Corpo muito grande.' }), { status: 413, headers: { 'content-type': 'application/json' } });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_JSON_BYTES) throw new Response(JSON.stringify({ error: 'Corpo muito grande.' }), { status: 413, headers: { 'content-type': 'application/json' } });
  const value = bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : null;
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
      .bind(makeId('audit'),tenantId,email||null,tenantId,JSON.stringify({ sections:['business','branding','catalog','portal'] }))
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

function validateSvg(bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes).toLowerCase();
  const unsafe = ['<script','javascript:','<foreignobject','onload=','onerror=','http://','https://'];
  if (unsafe.some((token) => text.includes(token))) throw new Response(JSON.stringify({ error: 'SVG contém conteúdo externo ou ativo não permitido.' }), { status: 400, headers: { 'content-type': 'application/json' } });
}

async function uploadAsset(request: Request, env: Env, tenantId: string, kind: string) {
  ensureSameOrigin(request);
  if (!['logo','logo-dark','favicon','catalog-hero','login-background'].includes(kind)) return json({ error: 'Tipo de arquivo inválido.' }, 400);
  const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = ALLOWED_ASSETS[contentType];
  if (!ext) return json({ error: 'Formato não permitido. Use PNG, JPG/JPEG, WebP ou SVG.' }, 415);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_ASSET_BYTES) return json({ error: 'Arquivo maior que 5 MB.' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength) return json({ error: 'Arquivo vazio.' }, 400);
  if (bytes.byteLength > MAX_ASSET_BYTES) return json({ error: 'Arquivo maior que 5 MB.' }, 413);
  if (contentType === 'image/svg+xml') validateSvg(bytes);
  const key = `tenants/${tenantId}/branding/${kind}/${crypto.randomUUID()}.${ext}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType, cacheControl: 'private, max-age=3600' }, customMetadata: { tenantId, kind } });
  return json({ data: { key, content_type: contentType, size_bytes: bytes.byteLength, url: `/api/company-assets/file?key=${encodeURIComponent(key)}` } }, 201);
}

async function serveAsset(request: Request, env: Env, tenantId: string) {
  const url = new URL(request.url);
  const key = clean(url.searchParams.get('key'), 600);
  if (!key || !key.startsWith(`tenants/${tenantId}/`)) return json({ error: 'Arquivo não encontrado.' }, 404);
  const object = await env.FILES.get(key);
  if (!object) return json({ error: 'Arquivo não encontrado.' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, max-age=3600');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

async function billingSummary(env: Env, tenantId: string) {
  const row = await env.DB.prepare(`
    SELECT s.id,s.status,s.trial_ends_at,s.current_period_end,s.provider,s.provider_subscription_id,
      p.id plan_id,p.name plan_name,p.slug plan_slug,p.price_monthly_cents
    FROM tenant_subscriptions s
    LEFT JOIN plans p ON p.id=s.plan_id
    WHERE s.tenant_id=? LIMIT 1
  `).bind(tenantId).first<Record<string, unknown>>();
  if (!row) return { status: 'unconfigured', plan_name: 'Sem plano', days_remaining: null };
  const endRaw = String(row.current_period_end || row.trial_ends_at || '');
  const end = endRaw ? new Date(endRaw.endsWith('Z') ? endRaw : `${endRaw.replace(' ','T')}Z`) : null;
  const days = end && Number.isFinite(end.getTime()) ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
  return { ...row, ends_at: endRaw || null, days_remaining: days };
}

async function supportReply(env: Env, tenantId: string, mode: string, message: string) {
  const [tenant, metrics, integration, subscription] = await Promise.all([
    env.DB.prepare('SELECT name,segment FROM tenants WHERE id=?').bind(tenantId).first<{name:string;segment:string}>(),
    Promise.all([
      env.DB.prepare("SELECT COUNT(*) n FROM orders WHERE tenant_id=? AND status NOT IN ('done','cancelled')").bind(tenantId).first<{n:number}>(),
      env.DB.prepare('SELECT COUNT(*) n FROM customers WHERE tenant_id=?').bind(tenantId).first<{n:number}>(),
      env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) n FROM orders WHERE tenant_id=? AND status!='cancelled'").bind(tenantId).first<{n:number}>(),
      env.DB.prepare('SELECT COUNT(*) n FROM catalog_items WHERE tenant_id=? AND active=1').bind(tenantId).first<{n:number}>()
    ]),
    env.DB.prepare(`SELECT component,status,message FROM integration_health_checks WHERE tenant_id=? ORDER BY checked_at DESC LIMIT 1`).bind(tenantId).first<{component:string;status:string;message:string}>(),
    billingSummary(env, tenantId)
  ]);
  const [orders, customers, sales, catalog] = metrics;
  const q = message.toLowerCase();
  const company = tenant?.name || 'sua empresa';
  if (mode === 'technical') {
    if (q.includes('whatsapp') || q.includes('evolution')) return `Para conectar o WhatsApp de ${company}, use Configurações → Canais. A homologação deve validar Evolution, webhook e status do canal antes de liberar mensagens reais. ${integration ? `Última saúde registrada: ${integration.component} = ${integration.status}.` : 'Ainda não há teste de saúde registrado para integrações.'}`;
    if (q.includes('logo') || q.includes('marca') || q.includes('aparência')) return 'Abra Configurações → Minha Empresa → Aparência. O logo aceita PNG, JPG/JPEG, WebP ou SVG sanitizado, com até 5 MB. Prefira PNG transparente com pelo menos 500 px ou SVG limpo.';
    if (q.includes('plano') || q.includes('vence') || q.includes('assinatura')) return `Seu plano atual é ${String(subscription.plan_name || 'não configurado')}. ${subscription.days_remaining === null ? 'Ainda não há vencimento definido.' : `Restam aproximadamente ${subscription.days_remaining} dia(s).`}`;
    if (q.includes('pedido')) return `O painel possui ${orders?.n || 0} pedido(s) em aberto. Você pode acompanhar e alterar status na área Pedidos conforme as permissões do seu perfil.`;
    return 'Posso ajudar com painel, usuários, permissões, catálogo, documentos, WhatsApp/Telegram, integrações, plano e erros da plataforma. Diga o que você estava tentando fazer e em qual tela.';
  }
  if (q.includes('venda') || q.includes('fatur')) return `${company} tem R$ ${((Number(sales?.n||0))/100).toLocaleString('pt-BR',{minimumFractionDigits:2})} registrados em pedidos não cancelados, ${orders?.n||0} pedido(s) em aberto e ${customers?.n||0} cliente(s). Eu começaria revisando os pedidos abertos e os clientes sem recompra recente.`;
  if (q.includes('catálogo') || q.includes('produto') || q.includes('estoque')) return `Seu catálogo tem ${catalog?.n||0} item(ns) ativos. Para melhorar conversão, priorize fotos claras, nomes objetivos, preço/condição visível e categorias simples. Depois podemos cruzar isso com vendas por item.`;
  if (q.includes('cliente') || q.includes('retorno') || q.includes('recompra')) return `Hoje existem ${customers?.n||0} clientes cadastrados. Uma boa próxima ação é segmentar quem já comprou e está há mais tempo sem novo pedido, mas qualquer disparo deve exigir sua autorização.`;
  return `Como Suporte ao Empreendedor, posso analisar operação, vendas, clientes e catálogo de ${company}. No momento vejo ${orders?.n||0} pedido(s) em aberto, ${customers?.n||0} cliente(s) e ${catalog?.n||0} item(ns) ativos. Pergunte sobre vendas, recompra, catálogo, atendimento ou prioridades.`;
}

async function supportChat(request: Request, env: Env, tenantId: string, session: Session) {
  const input = await readBody(request);
  const message = clean(input.message, 4000);
  const mode = clean(input.mode, 30) === 'entrepreneur' ? 'entrepreneur' : 'technical';
  if (!message) return json({ error: 'Digite sua dúvida.' }, 400);
  let threadId = clean(input.thread_id, 120);
  if (!threadId) {
    threadId = makeId('support');
    await env.DB.prepare(`INSERT INTO support_threads (id,tenant_id,user_id,support_mode,title,status,context_json) VALUES (?,?,NULL,?,?, 'open',?)`)
      .bind(threadId,tenantId,mode,message.slice(0,120),JSON.stringify({ page: clean(input.page,300), role: session.role || null, email: session.email || null })).run();
  } else {
    const exists = await env.DB.prepare('SELECT id FROM support_threads WHERE id=? AND tenant_id=?').bind(threadId,tenantId).first();
    if (!exists) return json({ error: 'Conversa de suporte não encontrada.' }, 404);
  }
  const answer = await supportReply(env, tenantId, mode, message);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO support_messages (id,thread_id,sender_type,body,metadata_json) VALUES (?,?,'user',?,?)`).bind(makeId('smsg'),threadId,message,JSON.stringify({ mode })),
    env.DB.prepare(`INSERT INTO support_messages (id,thread_id,sender_type,body,metadata_json) VALUES (?,?,'assistant',?,?)`).bind(makeId('smsg'),threadId,answer,JSON.stringify({ engine:'contextual-hml-v1', mode })),
    env.DB.prepare(`UPDATE support_threads SET updated_at=datetime('now'), support_mode=? WHERE id=?`).bind(mode,threadId),
    env.DB.prepare(`INSERT INTO ai_usage_events (id,tenant_id,agent_id,provider,model,modality,input_units,output_units,estimated_cost_micros,metadata_json) VALUES (?,?,NULL,'internal','support-context-v1','text',?,?,0,?)`)
      .bind(makeId('aiuse'),tenantId,message.length,answer.length,JSON.stringify({ support_mode:mode, hml:true }))
  ]);
  return json({ data: { thread_id: threadId, mode, answer, engine: 'contextual-hml-v1' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const custom = url.pathname === '/api/company-settings' ||
        url.pathname === '/api/company-settings/numbering' ||
        url.pathname.startsWith('/api/company-assets/') ||
        url.pathname === '/api/support/chat' ||
        url.pathname === '/api/billing/summary';

      if (custom) {
        const auth = await sessionFor(request, env);
        if (auth.response) return auth.response;
        const session = auth.session || {};
        const tenantId = session.tenant_id || env.DEFAULT_TENANT_ID;
        if (!tenantId) return json({ error: 'Tenant indisponível.' }, 403);

        if (url.pathname === '/api/company-settings' || url.pathname === '/api/company-settings/numbering' || url.pathname.startsWith('/api/company-assets/')) {
          try { ensureAdmin(session); } catch { return json({ error: 'Apenas administradores da empresa podem alterar a personalização.' }, 403); }
        }

        if (request.method === 'GET' && url.pathname === '/api/company-settings') return json({ data: await getCompanySettings(env, tenantId) });
        if (request.method === 'PUT' && url.pathname === '/api/company-settings') return json({ data: await saveCompanySettings(request, env, tenantId, session.email || '') });
        if (request.method === 'PUT' && url.pathname === '/api/company-settings/numbering') return json({ data: await saveNumbering(request, env, tenantId) });
        if (request.method === 'PUT' && /^\/api\/company-assets\/(logo|logo-dark|favicon|catalog-hero|login-background)$/.test(url.pathname)) {
          const kind = url.pathname.split('/').pop() || '';
          return uploadAsset(request, env, tenantId, kind);
        }
        if (request.method === 'GET' && url.pathname === '/api/company-assets/file') return serveAsset(request, env, tenantId);
        if (request.method === 'POST' && url.pathname === '/api/support/chat') return supportChat(request, env, tenantId, session);
        if (request.method === 'GET' && url.pathname === '/api/billing/summary') return json({ data: await billingSummary(env, tenantId) });
        return json({ error: 'Método não permitido.' }, 405);
      }
      return platform.fetch(request, env);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error('HML experience gateway error', error);
      return json({ error: 'Erro interno da homologação.' }, 500);
    }
  }
};
