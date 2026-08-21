/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,audit,authenticate,body,json} from './lib';

export async function handlePlatform(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(!url.pathname.startsWith('/api/platform'))return null;
  const actor=await authenticate(request,env);
  if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  if(actor.actorType!=='platform_user'||actor.role!=='super_admin')return json({error:'Acesso exclusivo do Super Admin.'},403);
  const method=request.method.toUpperCase();

  if(method==='GET'&&url.pathname==='/api/platform/tenants'){
    const result=await env.DB.prepare(`SELECT t.id,t.slug,t.name,t.segment,t.status,s.public_name,s.primary_color,s.secondary_color,sub.status subscription_status,sub.trial_ends_at,sub.current_period_end FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id=t.id LEFT JOIN tenant_subscriptions sub ON sub.tenant_id=t.id ORDER BY t.created_at DESC LIMIT 500`).all();
    return json({data:{selected_tenant_id:actor.tenantId,tenants:result.results}});
  }

  if(method==='POST'&&url.pathname==='/api/platform/select-tenant'){
    const input=await body(request);const tenantId=String(input.tenant_id||'').trim();
    if(!tenantId)return json({error:'Selecione uma empresa.'},400);
    const tenant=await env.DB.prepare('SELECT id,name,slug,status FROM tenants WHERE id=? LIMIT 1').bind(tenantId).first<{id:string;name:string;slug:string;status:string}>();
    if(!tenant)return json({error:'Empresa não encontrada.'},404);
    await env.DB.prepare(`UPDATE auth_sessions SET tenant_id=?,last_seen_at=datetime('now') WHERE id=? AND platform_user_id=?`).bind(tenant.id,actor.sessionId,actor.actorId).run();
    await audit(env,actor,tenant.id,'platform.tenant.selected','tenant',tenant.id,{slug:tenant.slug,status:tenant.status});
    return json({data:{ok:true,tenant}});
  }

  if(method==='POST'&&url.pathname==='/api/platform/clear-tenant'){
    await env.DB.prepare(`UPDATE auth_sessions SET tenant_id=NULL,last_seen_at=datetime('now') WHERE id=? AND platform_user_id=?`).bind(actor.sessionId,actor.actorId).run();
    await audit(env,actor,null,'platform.tenant.cleared','auth_session',actor.sessionId);
    return json({data:{ok:true}});
  }

  return json({error:'Endpoint não encontrado.'},404);
}
