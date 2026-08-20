import health from './hml-health';
import core from './hml-dispatch-core';

interface Env{DB:D1Database;FILES:R2Bucket;ASSETS:Fetcher;APP_ENVIRONMENT:string;DEFAULT_TENANT_ID:string;ACCESS_TEAM_DOMAIN:string;ACCESS_AUD:string;HML_USERNAME?:string;HML_PASSWORD?:string}
type Session={tenant_id?:string;email?:string;role?:string;global_role?:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const canManage=(s:Session)=>s.global_role==='super_admin'||['owner','admin','manager'].includes(String(s.role||''));
async function sessionFor(request:Request,env:Env){const r=await core.fetch(new Request(new URL('/api/session',request.url).toString(),{method:'GET',headers:request.headers}),env);if(!r.ok)return{response:r};const p=await r.clone().json().catch(()=>({})) as {data?:Session};return{session:p.data||{}}}
async function ensureHmlPlatformIdentity(env:Env){
  if(env.APP_ENVIRONMENT!=='hml')return;
  const tenantId=env.DEFAULT_TENANT_ID||'tenant_demo';
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO platform_users (id,email,name,global_role,status) VALUES ('puser_hml_admin','local@negociaja.invalid','Super Admin HML','super_admin','active')"),
    env.DB.prepare("UPDATE platform_users SET global_role='super_admin',status='active',updated_at=datetime('now') WHERE lower(email)='local@negociaja.invalid'"),
    env.DB.prepare("INSERT OR IGNORE INTO tenant_memberships (id,tenant_id,platform_user_id,role,permissions_json,status) SELECT 'membership_hml_admin',?,id,'owner','[\"*\"]','active' FROM platform_users WHERE lower(email)='local@negociaja.invalid'").bind(tenantId),
    env.DB.prepare("UPDATE tenant_memberships SET role='owner',permissions_json='[\"*\"]',status='active',updated_at=datetime('now') WHERE tenant_id=? AND platform_user_id=(SELECT id FROM platform_users WHERE lower(email)='local@negociaja.invalid' LIMIT 1)").bind(tenantId)
  ]);
}
async function safeFirst<T>(env:Env,sql:string,fallback:T):Promise<T>{try{return(await env.DB.prepare(sql).first<T>())||fallback}catch{return fallback}}
async function safeAll(env:Env,sql:string):Promise<Record<string,unknown>[]>{try{const r=await env.DB.prepare(sql).all();return(r.results||[]) as Record<string,unknown>[]}catch{return[]}}
async function platformCompat(env:Env,path:string):Promise<Response|null>{
  if(env.APP_ENVIRONMENT!=='hml')return null;
  if(path==='/api/platform/overview'){
    const [tenants,active,users,agents,channels,ai,billing,alerts,subs]=await Promise.all([
      safeFirst(env,'SELECT COUNT(*) total FROM tenants',{total:0}),
      safeFirst(env,"SELECT COUNT(*) total FROM tenants WHERE status='active'",{total:0}),
      safeFirst(env,"SELECT COUNT(*) total FROM platform_users WHERE status='active'",{total:0}),
      safeFirst(env,'SELECT COUNT(*) total FROM agent_profiles WHERE active=1',{total:0}),
      safeFirst(env,"SELECT COUNT(*) total FROM channels WHERE status!='disconnected'",{total:0}),
      safeFirst(env,'SELECT COALESCE(SUM(estimated_cost_micros),0) total FROM ai_usage_events',{total:0}),
      safeFirst(env,"SELECT COALESCE(SUM(amount_cents),0) total FROM platform_billing_events WHERE status='paid'",{total:0}),
      safeFirst(env,"SELECT COUNT(*) total FROM integration_health_checks WHERE status IN ('degraded','down') AND checked_at>=datetime('now','-24 hour')",{total:0}),
      safeFirst(env,"SELECT COUNT(*) total FROM tenant_subscriptions WHERE status IN ('trialing','active')",{total:0})
    ]);
    return json({data:{tenants:tenants.total||0,active_tenants:active.total||0,users:users.total||0,subscriptions:subs.total||0,agents:agents.total||0,connected_channels:channels.total||0,ai_cost_micros:ai.total||0,platform_revenue_cents:billing.total||0,unhealthy_integrations:alerts.total||0,compatibility_mode:true}});
  }
  if(path==='/api/platform/plans'){
    let rows=await safeAll(env,'SELECT id,slug,name,description,price_monthly_cents,price_yearly_cents,limits_json,features_json,active FROM plans ORDER BY price_monthly_cents,name');
    if(!rows.length){
      const legacy=await safeAll(env,'SELECT id,slug,name,price_cents,billing_cycle,trial_days,grace_days,limits_json,features_json,active FROM platform_plans ORDER BY price_cents,name');
      rows=legacy.map((p)=>({...p,description:'Plano SaaS',price_monthly_cents:Number(p.price_cents||0),price_yearly_cents:0}));
    }
    return json({data:rows});
  }
  if(path==='/api/platform/tenants'){
    const rows=await safeAll(env,`SELECT t.id,t.slug,t.name,t.segment,t.status,t.created_at,
      (SELECT COUNT(*) FROM tenant_memberships tm WHERE tm.tenant_id=t.id AND tm.status='active') users_count,
      (SELECT COUNT(*) FROM channels ch WHERE ch.tenant_id=t.id) channels_count,
      (SELECT COUNT(*) FROM agent_profiles ap WHERE ap.tenant_id=t.id AND ap.active=1) agents_count,
      (SELECT COALESCE(SUM(o.total_cents),0) FROM orders o WHERE o.tenant_id=t.id AND o.status!='cancelled') sales_cents
      FROM tenants t ORDER BY t.created_at DESC`);
    return json({data:rows.map((t)=>({...t,plan_name:'Compatibilidade HML',subscription_status:'unknown'}))});
  }
  if(path==='/api/platform/health'){
    const rows=await safeAll(env,`SELECT h.id,h.tenant_id,h.component,h.status,h.latency_ms,h.message,h.checked_at,t.name tenant_name
      FROM integration_health_checks h LEFT JOIN tenants t ON t.id=h.tenant_id ORDER BY h.checked_at DESC LIMIT 200`);
    return json({data:rows});
  }
  return null;
}
function keyFor(tenantId:string,itemId:string){return `tenants/${tenantId}/catalog/${itemId}/main`}
async function catalogImage(request:Request,env:Env,itemId:string){const auth=await sessionFor(request,env);if(auth.response)return auth.response;const s=auth.session||{},tenantId=s.tenant_id||env.DEFAULT_TENANT_ID;if(!tenantId)return json({error:'Tenant indisponível.'},403);const item=await env.DB.prepare('SELECT id FROM catalog_items WHERE id=? AND tenant_id=?').bind(itemId,tenantId).first();if(!item)return json({error:'Item não encontrado.'},404);const key=keyFor(tenantId,itemId),method=request.method.toUpperCase();if(method==='GET'){const obj=await env.FILES.get(key);if(!obj)return new Response(null,{status:404});const headers=new Headers();obj.writeHttpMetadata(headers);headers.set('cache-control','private, max-age=300');headers.set('x-content-type-options','nosniff');return new Response(obj.body,{headers})}if(method==='DELETE'){if(!canManage(s))return json({error:'Sem permissão para remover imagem.'},403);await env.FILES.delete(key);return json({data:{removed:true}})}if(method!=='PUT')return json({error:'Método não permitido.'},405);if(!canManage(s))return json({error:'Sem permissão para alterar imagem.'},403);const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem não autorizada.'},403);const mime=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();if(!['image/png','image/jpeg','image/webp'].includes(mime))return json({error:'Use PNG, JPG ou WebP.'},415);const bytes=await request.arrayBuffer();if(bytes.byteLength<16)return json({error:'Arquivo de imagem inválido.'},400);if(bytes.byteLength>5*1024*1024)return json({error:'Imagem maior que 5 MB.'},413);await env.FILES.put(key,bytes,{httpMetadata:{contentType:mime,cacheControl:'private, max-age=300'},customMetadata:{tenant_id:tenantId,catalog_item_id:itemId,uploaded_by:s.email||'operator'}});await env.DB.prepare("INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,payload_json) VALUES (?,?, 'operator',?,'catalog.image.updated','catalog_item',?,?)").bind(`audit_${crypto.randomUUID()}`,tenantId,s.email||null,itemId,JSON.stringify({mime,size:bytes.byteLength,key})).run();return json({data:{item_id:itemId,image_url:`/api/catalog/${encodeURIComponent(itemId)}/image`,mime,size:bytes.byteLength}},201)}
export default{async fetch(request:Request,env:Env):Promise<Response>{try{const u=new URL(request.url);if(env.APP_ENVIRONMENT==='hml'&&(u.pathname==='/super-admin'||u.pathname==='/super-admin/'||u.pathname.startsWith('/super-admin.')||u.pathname.startsWith('/api/platform/')))await ensureHmlPlatformIdentity(env);const compat=await platformCompat(env,u.pathname);if(compat)return compat;const image=u.pathname.match(/^\/api\/catalog\/([^/]+)\/image$/);if(image)return catalogImage(request,env,decodeURIComponent(image[1]));if(u.pathname.startsWith('/api/ops/integration-health')||u.pathname.startsWith('/api/privacy'))return health.fetch(request,env);return core.fetch(request,env)}catch(e){if(e instanceof Response)return e;console.error('HML stable gateway error',e);return json({error:'Erro interno do gateway HML.'},500)}}};
