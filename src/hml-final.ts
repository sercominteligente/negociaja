import multimodal from './hml-multimodal';

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

type Session = { tenant_id?: string; email?: string; role?: string; global_role?: string };
type Dict = Record<string, unknown>;

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const id=(p:string)=>`${p}_${crypto.randomUUID()}`;
const clean=(v:unknown,max=300)=>String(v??'').trim().slice(0,max);

async function sessionFor(request:Request,env:Env):Promise<{session?:Session;response?:Response}>{
  const r=await multimodal.fetch(new Request(new URL('/api/session',request.url).toString(),{method:'GET',headers:request.headers}),env);
  if(!r.ok)return{response:r};
  const p=await r.clone().json().catch(()=>({})) as {data?:Session};
  return{session:p.data||{}};
}

function canManage(s:Session){return s.global_role==='super_admin'||s.role==='owner'||s.role==='admin'||s.role==='manager';}
function canBill(s:Session){return s.global_role==='super_admin'||s.role==='owner'||s.role==='admin';}

async function readBody(request:Request):Promise<Dict>{
  const origin=request.headers.get('origin');
  if(origin!==new URL(request.url).origin) throw new Response(JSON.stringify({error:'Origem não autorizada.'}),{status:403,headers:{'content-type':'application/json'}});
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json')) throw new Response(JSON.stringify({error:'Envie application/json.'}),{status:415,headers:{'content-type':'application/json'}});
  const text=await request.text(); if(text.length>65536)throw new Response(JSON.stringify({error:'Corpo muito grande.'}),{status:413,headers:{'content-type':'application/json'}});
  try{const v=JSON.parse(text||'{}');if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v as Dict}catch{throw new Response(JSON.stringify({error:'JSON inválido.'}),{status:400,headers:{'content-type':'application/json'}});}
}

async function createChannel(request:Request,env:Env,tenantId:string,session:Session){
  if(!canManage(session))return json({error:'Seu perfil não pode configurar canais.'},403);
  const input=await readBody(request);const type=clean(input.channel_type,30).toLowerCase();
  if(!['whatsapp','telegram','web'].includes(type))return json({error:'Canal inválido.'},400);
  const name=clean(input.name,120)||(type==='whatsapp'?'WhatsApp':type==='telegram'?'Telegram':'Web');
  const provider=type==='whatsapp'?'evolution':type;
  const duplicate=await env.DB.prepare('SELECT id FROM channels WHERE tenant_id=? AND channel_type=? AND lower(name)=lower(?) LIMIT 1').bind(tenantId,type,name).first<{id:string}>();
  if(duplicate)return json({error:'Já existe um canal com esse nome e tipo.'},409);
  const channelId=id('ch');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO channels (id,tenant_id,channel_type,name,status,config_json) VALUES (?,?,?,?, 'disconnected','{}')").bind(channelId,tenantId,type,name),
    env.DB.prepare("INSERT OR IGNORE INTO integrations (id,tenant_id,provider,status,config_json) VALUES (?,?,?,'disconnected','{}')").bind(id('int'),tenantId,provider),
    env.DB.prepare("INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,payload_json) VALUES (?,?,'operator',?,'channel.created','channel',?,?)").bind(id('audit'),tenantId,session.email||null,channelId,JSON.stringify({channel_type:type,name,provider}))
  ]);
  return json({data:{id:channelId,channel_type:type,name,status:'disconnected',provider}},201);
}

async function renewal(request:Request,env:Env,tenantId:string,session:Session){
  if(!canBill(session))return json({error:'Apenas proprietário ou administrador pode renovar o plano.'},403);
  await readBody(request);
  const sub=await env.DB.prepare('SELECT s.id,p.price_monthly_cents,p.name FROM tenant_subscriptions s LEFT JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=? LIMIT 1').bind(tenantId).first<{id:string;price_monthly_cents:number;name:string}>();
  if(!sub)return json({error:'Assinatura não configurada.'},404);
  const existing=await env.DB.prepare("SELECT id,amount_cents FROM platform_billing_events WHERE tenant_id=? AND subscription_id=? AND event_type='renewal.requested' AND status='pending' AND created_at>=datetime('now','-15 minute') ORDER BY created_at DESC LIMIT 1").bind(tenantId,sub.id).first<{id:string;amount_cents:number}>();
  if(existing)return json({data:{id:existing.id,status:'pending_provider',provider:'mercadopago',amount_cents:existing.amount_cents,plan_name:sub.name||'Plano',duplicate:true}});
  const eventId=id('bill');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO platform_billing_events (id,tenant_id,subscription_id,event_type,amount_cents,status,provider,due_at,metadata_json) VALUES (?,?,?,'renewal.requested',?,'pending','mercadopago',datetime('now','+1 day'),?)").bind(eventId,tenantId,sub.id,sub.price_monthly_cents||0,JSON.stringify({requested_by:session.email||null,hml:true})),
    env.DB.prepare("INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,payload_json) VALUES (?,?,'operator',?,'billing.renewal.requested','subscription',?,?)").bind(id('audit'),tenantId,session.email||null,sub.id,JSON.stringify({event_id:eventId}))
  ]);
  return json({data:{id:eventId,status:'pending_provider',provider:'mercadopago',amount_cents:sub.price_monthly_cents||0,plan_name:sub.name||'Plano',duplicate:false}},201);
}

export default{async fetch(request:Request,env:Env):Promise<Response>{
  try{
    const url=new URL(request.url);const sensitive=url.pathname==='/api/ops/channels'||url.pathname==='/api/ops/renewal';
    if(!sensitive)return multimodal.fetch(request,env);
    if(request.method!=='POST')return json({error:'Método não permitido.'},405);
    const auth=await sessionFor(request,env);if(auth.response)return auth.response;const session=auth.session||{};const tenantId=session.tenant_id||env.DEFAULT_TENANT_ID;if(!tenantId)return json({error:'Tenant indisponível.'},403);
    if(url.pathname==='/api/ops/channels')return createChannel(request,env,tenantId,session);
    return renewal(request,env,tenantId,session);
  }catch(error){if(error instanceof Response)return error;console.error('HML final gateway error',error);return json({error:'Erro interno da homologação.'},500);}
}};
