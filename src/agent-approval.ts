/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Dict,Env,audit,authenticate,cents,json,makeId,resolveTenant} from './lib';

async function prepareOrder(env:Env,tenantId:string,args:Dict){
  const lines=Array.isArray(args.items)?args.items as Array<Record<string,unknown>>:[];
  if(!lines.length)throw new Error('Adicione pelo menos um item.');
  const resolved:Array<{catalog_item_id:string;name:string;qty:number;unit_price_cents:number;total_cents:number}>=[];
  let subtotal=0;
  for(const line of lines){
    const catalogId=String(line.catalog_item_id||'').trim();
    const qty=Math.max(.001,Number(line.qty||1));
    if(!catalogId||!Number.isFinite(qty))throw new Error('Item ou quantidade inválida.');
    const item=await env.DB.prepare(`SELECT id,name,price_cents,stock_control,stock_qty FROM catalog_items WHERE id=? AND tenant_id=? AND active=1 LIMIT 1`).bind(catalogId,tenantId).first<{id:string;name:string;price_cents:number;stock_control:number;stock_qty:number}>();
    if(!item)throw new Error(`Item inválido: ${catalogId}`);
    if(item.stock_control&&item.stock_qty<qty)throw new Error(`Estoque insuficiente para ${item.name}.`);
    const total=Math.round(item.price_cents*qty);subtotal+=total;
    resolved.push({catalog_item_id:item.id,name:item.name,qty,unit_price_cents:item.price_cents,total_cents:total});
  }
  const delivery=cents(args.delivery_cents),discount=Math.min(subtotal+delivery,cents(args.discount_cents));
  return{customer_name:String(args.customer_name||'Cliente').trim()||'Cliente',customer_phone:args.customer_phone?String(args.customer_phone).trim():null,items:resolved,subtotal_cents:subtotal,delivery_cents:delivery,discount_cents:discount,total_cents:subtotal+delivery-discount,fulfillment_type:String(args.fulfillment_type||'pickup').slice(0,40),notes:args.notes?String(args.notes).slice(0,2000):null};
}

async function defaultWorkflow(env:Env,tenantId:string){
  const row=await env.DB.prepare(`SELECT wt.id workflow_id,ws.step_key FROM workflow_templates wt JOIN workflow_steps ws ON ws.workflow_id=wt.id WHERE wt.tenant_id=? ORDER BY wt.is_default DESC,ws.sort_order ASC LIMIT 1`).bind(tenantId).first<{workflow_id:string;step_key:string}>();
  if(!row)throw new Error('Workflow da empresa não configurado.');
  return row;
}

async function createOrder(env:Env,tenantId:string,args:Dict,actorId:string){
  const preview=await prepareOrder(env,tenantId,args);
  const flow=await defaultWorkflow(env,tenantId);
  let customerId:string|null=null;
  if(preview.customer_phone){const found=await env.DB.prepare('SELECT id FROM customers WHERE tenant_id=? AND phone=? LIMIT 1').bind(tenantId,preview.customer_phone).first<{id:string}>();customerId=found?.id||null;}
  if(!customerId){customerId=makeId('cus');await env.DB.prepare('INSERT INTO customers (id,tenant_id,name,phone) VALUES (?,?,?,?)').bind(customerId,tenantId,preview.customer_name,preview.customer_phone).run();}
  const orderId=makeId('ord'),publicCode=`NJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
  const statements:D1PreparedStatement[]=[
    env.DB.prepare(`INSERT INTO orders (id,tenant_id,customer_id,workflow_id,public_code,source,transaction_type,status,subtotal_cents,delivery_cents,discount_cents,total_cents,fulfillment_type,notes) VALUES (?,?,?,?,?,'agent','order',?,?,?,?,?,?,?)`).bind(orderId,tenantId,customerId,flow.workflow_id,publicCode,flow.step_key,preview.subtotal_cents,preview.delivery_cents,preview.discount_cents,preview.total_cents,preview.fulfillment_type,preview.notes),
    env.DB.prepare(`INSERT INTO order_events (id,order_id,event_type,to_status,actor_type,actor_id,payload_json) VALUES (?,?,'order.created',?,'agent',?,?)`).bind(makeId('evt'),orderId,flow.step_key,actorId,JSON.stringify({source:'agent_gateway'}))
  ];
  for(const item of preview.items)statements.push(env.DB.prepare(`INSERT INTO order_items (id,order_id,catalog_item_id,name,qty,unit_price_cents,total_cents,options_json) VALUES (?,?,?,?,?,?,?,'{}')`).bind(makeId('line'),orderId,item.catalog_item_id,item.name,item.qty,item.unit_price_cents,item.total_cents));
  await env.DB.batch(statements);
  return{id:orderId,public_code:publicCode,status:flow.step_key,total_cents:preview.total_cents};
}

async function changeStatus(env:Env,tenantId:string,args:Dict,actorId:string){
  const id=String(args.id||'').trim(),next=String(args.status||'').trim();
  if(!id||!next)throw new Error('Pedido e status são obrigatórios.');
  const current=await env.DB.prepare(`SELECT status,workflow_id FROM orders WHERE id=? AND tenant_id=? LIMIT 1`).bind(id,tenantId).first<{status:string;workflow_id:string|null}>();
  if(!current)throw new Error('Pedido não encontrado.');
  const valid=await env.DB.prepare(`SELECT ws.step_key FROM workflow_steps ws JOIN workflow_templates wt ON wt.id=ws.workflow_id WHERE wt.tenant_id=? AND ws.step_key=? AND (? IS NULL OR wt.id=?) LIMIT 1`).bind(tenantId,next,current.workflow_id,current.workflow_id).first();
  if(!valid)throw new Error('Etapa inválida para o workflow.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(next,id,tenantId),
    env.DB.prepare(`INSERT INTO order_events (id,order_id,event_type,from_status,to_status,actor_type,actor_id) VALUES (?,?,?,?,?,'agent',?)`).bind(makeId('evt'),id,'order.status.changed',current.status,next,actorId)
  ]);
  return{id,from:current.status,status:next};
}

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
    if(call.tool_name==='order.create')result=await createOrder(env,tenantId,args,actor.actorId);
    else if(call.tool_name==='order.status.change')result=await changeStatus(env,tenantId,args,actor.actorId);
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
