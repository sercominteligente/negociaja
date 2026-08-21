/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Dict,Env,audit,authenticate,json,resolveTenant} from './lib';
import {changeOrderStatus,createOrder} from './order-service';

export async function handleAgentApproval(request:Request,env:Env,url:URL):Promise<Response|null>{
  const match=url.pathname.match(/^\/api\/agent-tools\/([^/]+)\/approve$/);
  if(!match)return null;
  if(request.method!=='POST')return json({error:'Método não permitido.'},405);
  const actor=await authenticate(request,env);if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  if(actor.role!=='admin'&&actor.role!=='super_admin')return json({error:'Apenas Admin pode aprovar ações de escrita.'},403);
  const tenantId=await resolveTenant(request,env,actor);if(!tenantId)return json({error:'Selecione uma empresa.'},409);
  const id=decodeURIComponent(match[1]);
  const call=await env.DB.prepare(`SELECT id,tool_name,status,arguments_json FROM agent_tool_calls WHERE id=? AND tenant_id=? LIMIT 1`).bind(id,tenantId).first<{id:string;tool_name:string;status:string;arguments_json:string}>();
  if(!call)return json({error:'Ação não encontrada.'},404);
  if(call.status!=='pending_approval')return json({error:'Ação não está pendente.'},409);

  const claimed=await env.DB.prepare(`UPDATE agent_tool_calls SET status='executing',approved_by_user_id=?,approved_at=datetime('now') WHERE id=? AND tenant_id=? AND status='pending_approval'`).bind(actor.actorId,id,tenantId).run();
  if(!claimed.meta.changes)return json({error:'Ação já foi assumida por outro aprovador.'},409);

  let args:Dict={};try{args=JSON.parse(call.arguments_json||'{}') as Dict;}catch{}
  try{
    let result:unknown;
    if(call.tool_name==='order.create')result=await createOrder(env,tenantId,args,{type:'agent',id:actor.actorId,source:'agent_gateway'});
    else if(call.tool_name==='order.status.change')result=await changeOrderStatus(env,tenantId,args,{type:'agent',id:actor.actorId});
    else throw new Error('Ferramenta de escrita não suportada para aprovação.');
    await env.DB.prepare(`UPDATE agent_tool_calls SET status='executed',result_json=?,error_text=NULL,executed_at=datetime('now') WHERE id=? AND tenant_id=? AND status='executing'`).bind(JSON.stringify(result),id,tenantId).run();
    await audit(env,actor,tenantId,'agent.tool.approved','agent_tool_call',id,{tool:call.tool_name});
    return json({data:{id,status:'executed',result}});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await env.DB.prepare(`UPDATE agent_tool_calls SET status='failed',error_text=?,executed_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(message.slice(0,1500),id,tenantId).run();
    await audit(env,actor,tenantId,'agent.tool.failed','agent_tool_call',id,{tool:call.tool_name});
    return json({error:message},400);
  }
}
