/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,audit,authenticate,body,cents,hasRole,json,makeId,resolveTenant} from './lib';
import {handleAuth} from './auth';
import {handleEnhancedSignup} from './signup-enhanced';
import {handleEnhancedLogin} from './login-enhanced';
import {ensureAuthSchema} from './auth-schema';

const ITEM_TYPES=new Set(['product','service','combo']);
const EXPECTED_SCHEMA_MIGRATION='0024_platform_testimonials.sql';

async function hasColumn(env:Env,table:string,column:string){
  try{const result=await env.DB.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();return (result.results||[]).some(row=>row.name===column);}catch{return false;}
}
async function d1Health(env:Env){
  const checks={
    users_password_hash:await hasColumn(env,'users','password_hash'),
    users_email_verified_at:await hasColumn(env,'users','email_verified_at'),
    tenant_settings_segment_label:await hasColumn(env,'tenant_settings','segment_label'),
    subscriptions_status:await hasColumn(env,'tenant_subscriptions','status'),
    email_verifications_token_hash:await hasColumn(env,'email_verifications','token_hash'),
    notification_deliveries_status:await hasColumn(env,'notification_deliveries','status'),
    auth_sessions_token_hash:await hasColumn(env,'auth_sessions','token_hash'),
    audit_logs_actor_role:await hasColumn(env,'audit_logs','actor_role'),
    audit_logs_metadata_json:await hasColumn(env,'audit_logs','metadata_json'),
    platform_marketing_testimonials_title:await hasColumn(env,'platform_marketing','testimonials_title')
  };
  let latestMigration:string|null=null;
  try{const latest=await env.DB.prepare('SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1').first<{name:string}>();latestMigration=latest?.name||null;}catch{}
  const schemaChecksReady=Object.values(checks).every(Boolean);
  return{ready:schemaChecksReady&&latestMigration===EXPECTED_SCHEMA_MIGRATION,latest_migration:latestMigration,expected_migration:EXPECTED_SCHEMA_MIGRATION,checks};
}

export async function handleApi(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(!url.pathname.startsWith('/api/'))return null;
  const method=request.method.toUpperCase();
  if(method==='GET'&&url.pathname==='/api/health'){
    const db=await d1Health(env);
    return json({ok:db.ready,app:'NegocIAJá!',version:'0.4.0',db,now:new Date().toISOString()},db.ready?200:503);
  }

  if(url.pathname.startsWith('/api/auth/')){
    try{await ensureAuthSchema(env);}catch(error){
      console.error(JSON.stringify({event:'auth_schema_repair_failed',path:url.pathname,error:error instanceof Error?error.message:String(error)}));
      return json({error:'Não foi possível preparar o acesso agora. Tente novamente em alguns instantes.',code:'AUTH_SCHEMA_UNAVAILABLE'},503);
    }
  }

  const enhancedSignup=await handleEnhancedSignup(request,env,url);if(enhancedSignup)return enhancedSignup;
  const enhancedLogin=await handleEnhancedLogin(request,env,url);if(enhancedLogin)return enhancedLogin;
  const authResponse=await handleAuth(request,env,url);if(authResponse)return authResponse;
  const actor=await authenticate(request,env);if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  const tenantId=await resolveTenant(request,env,actor);if(!tenantId)return json({error:actor.role==='super_admin'?'Selecione uma empresa válida.':'Empresa da sessão inválida.'},409);

  if(method==='GET'&&url.pathname==='/api/catalog'){
    const result=await env.DB.prepare(`SELECT id,sku,name,description,item_type,category,unit,pricing_mode,price_cents,active,stock_control,stock_qty,attributes_json,options_json,image_key FROM catalog_items WHERE tenant_id=? AND active=1 ORDER BY category,name`).bind(tenantId).all();
    return json({data:result.results||[]});
  }
  if(method==='POST'&&url.pathname==='/api/catalog'){
    if(!hasRole(actor,['admin','super_admin']))return json({error:'Permissão insuficiente para alterar catálogo.'},403);
    const input=await body(request),name=String(input.name||'').trim().slice(0,180);if(!name)return json({error:'Nome do item é obrigatório.'},400);
    const itemType=ITEM_TYPES.has(String(input.item_type))?String(input.item_type):'product';
    const stockQty=Math.max(0,Number(input.stock_qty||0));if(!Number.isFinite(stockQty))return json({error:'Estoque inválido.'},400);
    const id=makeId('item');
    await env.DB.prepare(`INSERT INTO catalog_items (id,tenant_id,sku,name,description,item_type,category,unit,pricing_mode,price_cents,active,stock_control,stock_qty,attributes_json,options_json) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`).bind(id,tenantId,input.sku?String(input.sku).slice(0,100):null,name,input.description?String(input.description).slice(0,4000):null,itemType,input.category?String(input.category).slice(0,120):null,String(input.unit||'un').slice(0,40),String(input.pricing_mode||'fixed').slice(0,40),cents(input.price_cents),input.stock_control?1:0,stockQty,JSON.stringify(input.attributes||{}),JSON.stringify(input.options||[])).run();
    await audit(env,actor,tenantId,'catalog.create','catalog_item',id,{name});return json({data:{id,name}},201);
  }

  const catalogRoute=url.pathname.match(/^\/api\/catalog\/([^/]+)$/);
  if(method==='PATCH'&&catalogRoute){
    if(!hasRole(actor,['admin','super_admin']))return json({error:'Permissão insuficiente para alterar catálogo.'},403);
    const input=await body(request),id=decodeURIComponent(catalogRoute[1]);
    const current=await env.DB.prepare(`SELECT id,name,item_type,category,price_cents,stock_control,stock_qty,active FROM catalog_items WHERE id=? AND tenant_id=? LIMIT 1`).bind(id,tenantId).first<{id:string;name:string;item_type:string;category:string|null;price_cents:number;stock_control:number;stock_qty:number;active:number}>();
    if(!current)return json({error:'Item não encontrado.'},404);
    const name=input.name===undefined?current.name:String(input.name||'').trim().slice(0,180);if(!name)return json({error:'Nome do item é obrigatório.'},400);
    const requestedType=input.item_type===undefined?current.item_type:String(input.item_type);const itemType=ITEM_TYPES.has(requestedType)?requestedType:current.item_type;
    const category=input.category===undefined?current.category:(input.category?String(input.category).slice(0,120):null);
    const priceCents=input.price_cents===undefined?current.price_cents:cents(input.price_cents);
    const stockControl=input.stock_control===undefined?current.stock_control:(input.stock_control?1:0);
    const rawStock=input.stock_qty===undefined?current.stock_qty:Number(input.stock_qty);if(!Number.isFinite(rawStock)||rawStock<0)return json({error:'Estoque inválido.'},400);
    const active=input.active===undefined?current.active:(input.active?1:0);
    await env.DB.prepare(`UPDATE catalog_items SET name=?,item_type=?,category=?,price_cents=?,stock_control=?,stock_qty=?,active=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(name,itemType,category,priceCents,stockControl,rawStock,active,id,tenantId).run();
    await audit(env,actor,tenantId,'catalog.update','catalog_item',id,{active:Boolean(active)});return json({data:{id,name,active:Boolean(active)}});
  }

  if(method==='GET'&&url.pathname==='/api/workflows'){
    const result=await env.DB.prepare(`SELECT wt.id workflow_id,wt.name workflow_name,wt.transaction_type,ws.id step_id,ws.step_key,ws.label,ws.sort_order,ws.color,ws.customer_message FROM workflow_templates wt LEFT JOIN workflow_steps ws ON ws.workflow_id=wt.id WHERE wt.tenant_id=? ORDER BY wt.is_default DESC,wt.name,ws.sort_order`).bind(tenantId).all();
    return json({data:result.results||[]});
  }
  if(method==='GET'&&url.pathname==='/api/automations'){
    const result=await env.DB.prepare(`SELECT id,name,trigger_type,action_type,active,created_at FROM automation_rules WHERE tenant_id=? ORDER BY created_at DESC`).bind(tenantId).all();
    return json({data:result.results||[]});
  }

  return json({error:'Endpoint não encontrado.'},404);
}
