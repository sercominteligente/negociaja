import lab from './hml-lab';

interface Env { DB:D1Database; FILES:R2Bucket; ASSETS:Fetcher; APP_ENVIRONMENT:string; DEFAULT_TENANT_ID:string; ACCESS_TEAM_DOMAIN:string; ACCESS_AUD:string; HML_USERNAME?:string; HML_PASSWORD?:string; RESEND_API_KEY?:string; RESEND_FROM_EMAIL?:string; MERCADOPAGO_ACCESS_TOKEN?:string; MERCADOPAGO_WEBHOOK_SECRET?:string; }
type Session={tenant_id?:string;email?:string;role?:string;global_role?:string};
type Subscription={id:string;status:string;trial_ends_at:string|null;current_period_end:string|null;grace_until:string|null;plan_name:string|null;grace_days:number|null};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const parseUtc=(value:string|null|undefined)=>{if(!value)return null;const normalized=value.includes('T')?value:`${value.replace(' ','T')}Z`;const d=new Date(normalized);return Number.isFinite(d.getTime())?d:null};
const sqlDate=(d:Date)=>d.toISOString().slice(0,19).replace('T',' ');
async function sessionFor(request:Request,env:Env):Promise<{session?:Session;response?:Response}>{const r=await lab.fetch(new Request(new URL('/api/session',request.url).toString(),{method:'GET',headers:request.headers}),env);if(!r.ok)return{response:r};const p=await r.clone().json().catch(()=>({})) as {data?:Session};return{session:p.data||{}};}
async function subscription(env:Env,tenantId:string){return env.DB.prepare(`SELECT s.id,s.status,s.trial_ends_at,s.current_period_end,s.grace_until,p.name plan_name,COALESCE(pp.grace_days,3) grace_days FROM tenant_subscriptions s LEFT JOIN plans p ON p.id=s.plan_id LEFT JOIN platform_plans pp ON pp.id=s.plan_id WHERE s.tenant_id=? LIMIT 1`).bind(tenantId).first<Subscription>();}
async function reconcile(env:Env,tenantId:string){
  const row=await subscription(env,tenantId);if(!row)return{status:'unconfigured',access:'blocked',days_remaining:null,grace_days_remaining:null,plan_name:'Sem plano'};
  const now=new Date();const end=parseUtc(row.current_period_end)||parseUtc(row.trial_ends_at);
  if(!end)return{...row,access:'allowed',days_remaining:null,grace_days_remaining:null};
  const days=Math.ceil((end.getTime()-now.getTime())/86400000);
  if(end.getTime()>=now.getTime()){
    const desired=row.status==='trialing'?'trialing':'active';if(row.status==='past_due'||row.status==='suspended')await env.DB.prepare("UPDATE tenant_subscriptions SET status=?,grace_until=NULL,updated_at=datetime('now') WHERE id=?").bind(desired,row.id).run();
    return{...row,status:desired,access:'allowed',days_remaining:Math.max(0,days),grace_days_remaining:null,ends_at:sqlDate(end)};
  }
  const graceDays=Math.max(0,Number(row.grace_days||3));let grace=parseUtc(row.grace_until);if(!grace){grace=new Date(end.getTime()+graceDays*86400000);await env.DB.prepare("UPDATE tenant_subscriptions SET grace_until=?,updated_at=datetime('now') WHERE id=?").bind(sqlDate(grace),row.id).run();}
  const remaining=Math.ceil((grace.getTime()-now.getTime())/86400000);
  if(grace.getTime()>=now.getTime()){
    if(row.status!=='past_due')await env.DB.prepare("UPDATE tenant_subscriptions SET status='past_due',updated_at=datetime('now') WHERE id=?").bind(row.id).run();
    return{...row,status:'past_due',access:'grace',days_remaining:days,grace_until:sqlDate(grace),grace_days_remaining:Math.max(0,remaining),ends_at:sqlDate(end)};
  }
  if(row.status!=='suspended')await env.DB.prepare("UPDATE tenant_subscriptions SET status='suspended',updated_at=datetime('now') WHERE id=?").bind(row.id).run();
  return{...row,status:'suspended',access:'blocked',days_remaining:days,grace_until:sqlDate(grace),grace_days_remaining:0,ends_at:sqlDate(end)};
}
const allowedWhenBlocked=(path:string,method:string)=>{
  if(method==='GET'&&['/api/session','/api/health','/api/license/status','/api/billing/summary','/api/company-settings'].includes(path))return true;
  if(method==='POST'&&['/api/billing/pix','/api/support/chat'].includes(path))return true;
  if(path==='/api/webhooks/mercadopago')return true;
  return path.startsWith('/api/company-assets/file');
};
export default{async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);const method=request.method.toUpperCase();
  if(!url.pathname.startsWith('/api/')&&url.pathname!=='/app'&&url.pathname!=='/app.html')return lab.fetch(request,env);
  const auth=await sessionFor(request,env);if(auth.response)return auth.response;const tenantId=auth.session?.tenant_id||env.DEFAULT_TENANT_ID;if(!tenantId)return json({error:'Tenant indisponível.'},403);
  const state=await reconcile(env,tenantId);
  if(method==='GET'&&url.pathname==='/api/license/status')return json({data:state});
  if(state.access==='blocked'){
    if((url.pathname==='/app'||url.pathname==='/app.html')&&method==='GET')return Response.redirect(new URL('/license.html',request.url).toString(),302);
    if(url.pathname.startsWith('/api/')&&!allowedWhenBlocked(url.pathname,method))return json({error:'Plano vencido. Renove para continuar operando.',code:'license_suspended',license:state},402);
  }
  return lab.fetch(request,env);
}};
