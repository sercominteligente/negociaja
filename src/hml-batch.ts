import experience from './hml';

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

type Session = { tenant_id?: string; global_role?: string; role?: string; email?: string };
type Dict = Record<string, unknown>;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const clean = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch] || ch));

async function sessionFor(request: Request, env: Env): Promise<{ session?: Session; response?: Response }> {
  const req = new Request(new URL('/api/session', request.url).toString(), { method: 'GET', headers: request.headers });
  const response = await experience.fetch(req, env);
  if (!response.ok) return { response };
  const payload = await response.clone().json().catch(() => ({})) as { data?: Session };
  return { session: payload.data || {} };
}

function ensureOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new Response(JSON.stringify({ error: 'Origem não autorizada.' }), { status: 403, headers: { 'content-type':'application/json' } });
}

async function body(request: Request): Promise<Dict> {
  ensureOrigin(request);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new Response(JSON.stringify({ error: 'Envie application/json.' }), { status:415, headers:{'content-type':'application/json'} });
  const raw = await request.text();
  if (raw.length > 65536) throw new Response(JSON.stringify({ error: 'Corpo muito grande.' }), { status:413, headers:{'content-type':'application/json'} });
  try {
    const value = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Dict;
  } catch { throw new Response(JSON.stringify({ error: 'JSON inválido.' }), { status:400, headers:{'content-type':'application/json'} }); }
}

function canManage(session: Session) {
  return session.global_role === 'super_admin' || session.role === 'owner' || session.role === 'admin' || session.role === 'manager';
}

async function opsOverview(env: Env, tenantId: string) {
  const [sales, paid, pending, avg, customers, orders, docs, channels, integrations, monthly, subscription] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) v FROM orders WHERE tenant_id=? AND status!='cancelled'").bind(tenantId).first<{v:number}>(),
    env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) v FROM orders WHERE tenant_id=? AND status!='cancelled' AND payment_status='paid'").bind(tenantId).first<{v:number}>(),
    env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) v FROM orders WHERE tenant_id=? AND status!='cancelled' AND payment_status!='paid'").bind(tenantId).first<{v:number}>(),
    env.DB.prepare("SELECT COALESCE(AVG(total_cents),0) v FROM orders WHERE tenant_id=? AND status!='cancelled'").bind(tenantId).first<{v:number}>(),
    env.DB.prepare('SELECT COUNT(*) v FROM customers WHERE tenant_id=?').bind(tenantId).first<{v:number}>(),
    env.DB.prepare("SELECT COUNT(*) v FROM orders WHERE tenant_id=? AND status NOT IN ('done','cancelled')").bind(tenantId).first<{v:number}>(),
    env.DB.prepare('SELECT COUNT(*) v FROM generated_documents WHERE tenant_id=?').bind(tenantId).first<{v:number}>(),
    env.DB.prepare('SELECT id,channel_type,name,status,created_at FROM channels WHERE tenant_id=? ORDER BY created_at DESC').bind(tenantId).all(),
    env.DB.prepare('SELECT id,provider,status,updated_at FROM integrations WHERE tenant_id=? ORDER BY provider').bind(tenantId).all(),
    env.DB.prepare(`SELECT substr(created_at,1,7) month, COUNT(*) orders_count, COALESCE(SUM(total_cents),0) sales_cents FROM orders WHERE tenant_id=? AND status!='cancelled' AND created_at>=datetime('now','-6 months') GROUP BY substr(created_at,1,7) ORDER BY month`).bind(tenantId).all(),
    env.DB.prepare(`SELECT s.status,s.trial_ends_at,s.current_period_end,p.name plan_name,p.price_monthly_cents FROM tenant_subscriptions s LEFT JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=? LIMIT 1`).bind(tenantId).first<Record<string,unknown>>()
  ]);
  return {
    finance: { sales_cents:sales?.v||0, paid_cents:paid?.v||0, receivable_cents:pending?.v||0, avg_ticket_cents:Math.round(avg?.v||0) },
    operation: { customers:customers?.v||0, open_orders:orders?.v||0, documents:docs?.v||0 },
    channels: channels.results,
    integrations: integrations.results,
    monthly: monthly.results,
    subscription: subscription || null
  };
}

async function createChannel(request: Request, env: Env, tenantId: string, session: Session) {
  if (!canManage(session)) return json({ error:'Seu perfil não pode configurar canais.' },403);
  const input = await body(request);
  const type = clean(input.channel_type,30).toLowerCase();
  if (!['whatsapp','telegram','web'].includes(type)) return json({ error:'Canal inválido.' },400);
  const name = clean(input.name,120) || (type === 'whatsapp' ? 'WhatsApp' : type === 'telegram' ? 'Telegram' : 'Web');
  const channelId = id('ch');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO channels (id,tenant_id,channel_type,name,status,config_json) VALUES (?,?,?,?, 'disconnected', '{}')`).bind(channelId,tenantId,type,name),
    env.DB.prepare(`INSERT OR IGNORE INTO integrations (id,tenant_id,provider,status,config_json) VALUES (?,?,?,'disconnected','{}')`).bind(id('int'),tenantId,type === 'whatsapp' ? 'evolution' : type,type === 'whatsapp' ? 'evolution' : type),
    env.DB.prepare(`INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,payload_json) VALUES (?,?,'operator',?,'channel.created','channel',?,?)`).bind(id('audit'),tenantId,session.email||null,channelId,JSON.stringify({channel_type:type,name}))
  ]);
  return json({ data:{id:channelId,channel_type:type,name,status:'disconnected'} },201);
}

async function createRenewal(env: Env, tenantId: string, session: Session) {
  const subscription = await env.DB.prepare(`SELECT s.id,p.price_monthly_cents,p.name FROM tenant_subscriptions s LEFT JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=? LIMIT 1`).bind(tenantId).first<{id:string;price_monthly_cents:number;name:string}>();
  if (!subscription) return json({ error:'Assinatura não configurada.' },404);
  const eventId = id('bill');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO platform_billing_events (id,tenant_id,subscription_id,event_type,amount_cents,status,provider,due_at,metadata_json) VALUES (?,?,?,'renewal.requested',?,'pending','mercadopago',datetime('now','+1 day'),?)`).bind(eventId,tenantId,subscription.id,subscription.price_monthly_cents||0,JSON.stringify({requested_by:session.email||null,hml:true})),
    env.DB.prepare(`INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,payload_json) VALUES (?,?,'operator',?,'billing.renewal.requested','subscription',?,?)`).bind(id('audit'),tenantId,session.email||null,subscription.id,JSON.stringify({event_id:eventId}))
  ]);
  return json({ data:{id:eventId,status:'pending_provider',provider:'mercadopago',amount_cents:subscription.price_monthly_cents||0,plan_name:subscription.name||'Plano'} },201);
}

function nextDocumentNumber(prefix: string|null, suffix: string|null, next: number, padding: number) {
  return `${prefix||''}${String(next).padStart(Math.max(1,padding||5),'0')}${suffix||''}`;
}

async function generateDocument(request: Request, env: Env, tenantId: string, session: Session, type: string, entityId: string) {
  if (!['order','receipt','quote','invoice'].includes(type)) return json({ error:'Tipo de documento inválido.' },400);
  const order = await env.DB.prepare(`SELECT o.*,c.name customer_name,c.phone customer_phone,c.email customer_email FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=? AND o.tenant_id=? LIMIT 1`).bind(entityId,tenantId).first<Record<string,unknown>>();
  if (!order) return json({ error:'Pedido não encontrado.' },404);
  const [lines, business, branding, numbering] = await Promise.all([
    env.DB.prepare('SELECT name,qty,unit_price_cents,total_cents FROM order_items WHERE order_id=?').bind(entityId).all(),
    env.DB.prepare('SELECT * FROM tenant_business_profile WHERE tenant_id=?').bind(tenantId).first<Record<string,unknown>>(),
    env.DB.prepare('SELECT * FROM tenant_branding WHERE tenant_id=?').bind(tenantId).first<Record<string,unknown>>(),
    env.DB.prepare('SELECT prefix,suffix,next_number,padding FROM document_numbering WHERE tenant_id=? AND document_type=?').bind(tenantId,type).first<{prefix:string|null;suffix:string|null;next_number:number;padding:number}>()
  ]);
  if (!numbering) return json({ error:'Numeração do documento não configurada.' },409);
  const number = nextDocumentNumber(numbering.prefix,numbering.suffix,numbering.next_number,numbering.padding);
  const docId = id('doc');
  const snapshot = { type, number, order, items:lines.results, business:business||{}, branding:branding||{}, generated_at:new Date().toISOString() };
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO generated_documents (id,tenant_id,document_type,document_number,entity_type,entity_id,status,snapshot_json,created_by) VALUES (?,?,?,?,'order',?,'generated',?,?)`).bind(docId,tenantId,type,number,entityId,JSON.stringify(snapshot),session.email||null),
    env.DB.prepare(`UPDATE document_numbering SET next_number=next_number+1,updated_at=datetime('now') WHERE tenant_id=? AND document_type=?`).bind(tenantId,type),
    env.DB.prepare(`INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,payload_json) VALUES (?,?,'operator',?,'document.generated','generated_document',?,?)`).bind(id('audit'),tenantId,session.email||null,docId,JSON.stringify({type,number,order_id:entityId}))
  ]);
  return json({ data:{id:docId,document_type:type,document_number:number,view_url:`/api/ops/documents/${encodeURIComponent(docId)}/view`} },201);
}

async function documentView(env: Env, tenantId: string, docId: string) {
  const row = await env.DB.prepare('SELECT document_type,document_number,snapshot_json FROM generated_documents WHERE id=? AND tenant_id=? LIMIT 1').bind(docId,tenantId).first<{document_type:string;document_number:string;snapshot_json:string}>();
  if (!row) return new Response('Documento não encontrado.',{status:404});
  let s:any={}; try{s=JSON.parse(row.snapshot_json||'{}')}catch{}
  const company=s.business?.trade_name||s.business?.legal_name||s.branding?.company_display_name||'Empresa';
  const items=Array.isArray(s.items)?s.items:[];
  const rows=items.map((x:any)=>`<tr><td>${esc(x.name)}</td><td>${esc(x.qty)}</td><td>R$ ${(Number(x.unit_price_cents||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td>R$ ${(Number(x.total_cents||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>`).join('');
  const total=(Number(s.order?.total_cents||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const logo=s.branding?.logo_key?`<img src="/api/company-assets/file?key=${encodeURIComponent(s.branding.logo_key)}" alt="Logo">`:'';
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(row.document_number)}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:0;background:#eef2f7}.sheet{max-width:820px;margin:24px auto;background:#fff;padding:36px;border-radius:12px}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid ${esc(s.branding?.primary_color||'#169CFF')};padding-bottom:20px}img{max-width:180px;max-height:80px;object-fit:contain}h1{margin:0;font-size:24px}table{width:100%;border-collapse:collapse;margin:28px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #e5e7eb}.total{text-align:right;font-size:22px;font-weight:800}.muted{color:#667085}.actions{max-width:820px;margin:12px auto;display:flex;justify-content:flex-end}.actions button{padding:10px 16px;border:0;border-radius:9px;background:#0b2b7c;color:#fff;font-weight:700}@media print{body{background:#fff}.sheet{margin:0;max-width:none;border-radius:0}.actions{display:none}}</style></head><body><div class="actions"><button onclick="print()">Imprimir / Salvar PDF</button></div><main class="sheet"><header><div>${logo}<h1>${esc(company)}</h1><div class="muted">${esc(s.business?.document_number||'')}</div></div><div><strong>${esc(String(row.document_type).toUpperCase())}</strong><br>${esc(row.document_number)}<br><span class="muted">${new Date(s.generated_at||Date.now()).toLocaleDateString('pt-BR')}</span></div></header><section><h2>${esc(s.order?.customer_name||'Cliente')}</h2><div class="muted">${esc(s.order?.customer_phone||'')}</div></section><table><thead><tr><th>Item</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Total: R$ ${total}</div><p>${esc(s.business?.payment_instructions||'')}</p><p class="muted">${esc(s.business?.terms_text||'')}</p><footer class="muted">${esc(s.branding?.footer_text||'Powered by NegocIAJá!')}</footer></main></body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});
}

async function listDocuments(env: Env, tenantId: string) {
  const result=await env.DB.prepare(`SELECT id,document_type,document_number,entity_id,status,created_at FROM generated_documents WHERE tenant_id=? ORDER BY created_at DESC LIMIT 30`).bind(tenantId).all();
  return result.results;
}

async function createTicket(request: Request, env: Env, tenantId: string, session: Session) {
  const input=await body(request); const subject=clean(input.subject,180); const description=clean(input.description,4000); const category=['technical','billing','integration','business'].includes(clean(input.category,30))?clean(input.category,30):'technical';
  if(!subject) return json({error:'Assunto obrigatório.'},400); const ticketId=id('ticket');
  await env.DB.prepare(`INSERT INTO support_tickets (id,tenant_id,thread_id,requester_user_id,category,priority,status,subject,description) VALUES (?,?,NULL,NULL,?,'normal','open',?,?)`).bind(ticketId,tenantId,category,subject,description||null).run();
  await env.DB.prepare(`INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,payload_json) VALUES (?,?,'operator',?,'support.ticket.created','support_ticket',?,?)`).bind(id('audit'),tenantId,session.email||null,ticketId,JSON.stringify({category})).run();
  return json({data:{id:ticketId,status:'open',subject,category}},201);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url=new URL(request.url);
      if(!url.pathname.startsWith('/api/ops/')) return experience.fetch(request,env);
      const auth=await sessionFor(request,env); if(auth.response) return auth.response; const session=auth.session||{}; const tenantId=session.tenant_id||env.DEFAULT_TENANT_ID; if(!tenantId) return json({error:'Tenant indisponível.'},403);
      const method=request.method.toUpperCase();
      if(method==='GET'&&url.pathname==='/api/ops/overview') return json({data:await opsOverview(env,tenantId)});
      if(method==='GET'&&url.pathname==='/api/ops/documents') return json({data:await listDocuments(env,tenantId)});
      if(method==='POST'&&url.pathname==='/api/ops/channels') return createChannel(request,env,tenantId,session);
      if(method==='POST'&&url.pathname==='/api/ops/renewal') return createRenewal(env,tenantId,session);
      if(method==='POST'&&url.pathname==='/api/ops/support/tickets') return createTicket(request,env,tenantId,session);
      const gen=url.pathname.match(/^\/api\/ops\/documents\/(order|receipt|quote|invoice)\/([^/]+)$/); if(method==='POST'&&gen) return generateDocument(request,env,tenantId,session,gen[1],decodeURIComponent(gen[2]));
      const view=url.pathname.match(/^\/api\/ops\/documents\/([^/]+)\/view$/); if(method==='GET'&&view) return documentView(env,tenantId,decodeURIComponent(view[1]));
      return json({error:'Endpoint operacional não encontrado.'},404);
    } catch(error) {
      if(error instanceof Response) return error;
      console.error('HML operational batch error',error);
      return json({error:'Erro interno no módulo operacional.'},500);
    }
  }
};
