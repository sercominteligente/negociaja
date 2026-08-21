/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,authenticate,json,resolveTenant} from './lib';

export async function handleCoreDashboard(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(request.method!=='GET'||url.pathname!=='/api/dashboard')return null;
  const actor=await authenticate(request,env);
  if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  const tenantId=await resolveTenant(request,env,actor);
  if(!tenantId)return json({error:actor.role==='super_admin'?'Selecione uma empresa.':'Empresa da sessão inválida.'},409);
  const [customers,catalog,openOrders,sales,conversations,human,ai,pendingActions,queueIssues]=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) total FROM customers WHERE tenant_id=?').bind(tenantId).first<{total:number}>(),
    env.DB.prepare('SELECT COUNT(*) total FROM catalog_items WHERE tenant_id=? AND active=1').bind(tenantId).first<{total:number}>(),
    env.DB.prepare("SELECT COUNT(*) total FROM orders WHERE tenant_id=? AND status NOT IN ('done','cancelled')").bind(tenantId).first<{total:number}>(),
    env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) total FROM orders WHERE tenant_id=? AND status!='cancelled'").bind(tenantId).first<{total:number}>(),
    env.DB.prepare("SELECT COUNT(*) total FROM conversations WHERE tenant_id=? AND status='open'").bind(tenantId).first<{total:number}>(),
    env.DB.prepare("SELECT COUNT(*) total FROM conversations WHERE tenant_id=? AND status='open' AND mode='human'").bind(tenantId).first<{total:number}>(),
    env.DB.prepare("SELECT COUNT(*) total FROM conversations WHERE tenant_id=? AND status='open' AND mode='ai'").bind(tenantId).first<{total:number}>(),
    env.DB.prepare("SELECT COUNT(*) total FROM agent_tool_calls WHERE tenant_id=? AND status='pending_approval'").bind(tenantId).first<{total:number}>(),
    env.DB.prepare("SELECT COUNT(*) total FROM agent_async_jobs WHERE tenant_id=? AND status IN ('retry','enqueue_failed')").bind(tenantId).first<{total:number}>()
  ]);
  return json({data:{
    customers:customers?.total??0,
    catalogItems:catalog?.total??0,
    openOrders:openOrders?.total??0,
    salesCents:sales?.total??0,
    activeConversations:conversations?.total??0,
    humanConversations:human?.total??0,
    aiConversations:ai?.total??0,
    pendingAgentActions:pendingActions?.total??0,
    queueIssues:queueIssues?.total??0,
    session:{name:actor.name,role:actor.role,tenantId}
  }});
}
