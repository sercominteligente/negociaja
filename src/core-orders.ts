/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Dict,Env,audit,authenticate,body,json,resolveTenant} from './lib';
import {changeOrderStatus,createOrder} from './order-service';

export async function handleCoreOrders(request:Request,env:Env,url:URL):Promise<Response|null>{
  const method=request.method.toUpperCase();
  const isList=url.pathname==='/api/orders';
  const statusMatch=url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if(!isList&&!statusMatch)return null;
  const actor=await authenticate(request,env);if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  const tenantId=await resolveTenant(request,env,actor);if(!tenantId)return json({error:'Selecione uma empresa.'},409);
  if(!['operator','admin','super_admin'].includes(actor.role))return json({error:'Permissão insuficiente.'},403);

  if(isList&&method==='GET'){
    const result=await env.DB.prepare(`SELECT o.id,o.public_code,o.transaction_type,o.status,o.source,o.total_cents,o.payment_status,o.fulfillment_type,o.created_at,o.workflow_id,c.name customer_name,c.phone customer_phone FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.tenant_id=? ORDER BY datetime(o.created_at) DESC LIMIT 200`).bind(tenantId).all();
    return json({data:result.results||[]});
  }
  if(isList&&method==='POST'){
    const input=await body(request);
    try{
      const result=await createOrder(env,tenantId,input,{type:'operator',id:actor.actorId,source:String(input.source||'panel')});
      await audit(env,actor,tenantId,'order.create','order',result.id,{public_code:result.public_code,total_cents:result.total_cents,workflow_id:result.workflow_id});
      return json({data:result},201);
    }catch(error){return json({error:error instanceof Error?error.message:String(error)},400);}
  }
  if(statusMatch&&method==='PATCH'){
    let input:Dict={};try{input=await request.json() as Dict;}catch{}
    try{
      const result=await changeOrderStatus(env,tenantId,{...input,id:decodeURIComponent(statusMatch[1])},{type:'operator',id:actor.actorId});
      await audit(env,actor,tenantId,'order.status.change','order',result.id,{from:result.from,to:result.status,workflow_id:result.workflow_id});
      return json({data:result});
    }catch(error){return json({error:error instanceof Error?error.message:String(error)},400);}
  }
  return json({error:'Método não permitido.'},405);
}
