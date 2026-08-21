/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Dict,Env,cents,makeId} from './lib';

export type PreparedOrder={
  customer_name:string;customer_phone:string|null;
  items:Array<{catalog_item_id:string;name:string;qty:number;unit_price_cents:number;total_cents:number;stock_control:number}>;
  subtotal_cents:number;delivery_cents:number;discount_cents:number;total_cents:number;
  fulfillment_type:string;notes:string|null;
};

export async function prepareOrder(env:Env,tenantId:string,args:Dict):Promise<PreparedOrder>{
  const lines=Array.isArray(args.items)?args.items as Array<Record<string,unknown>>:[];
  if(!lines.length)throw new Error('Adicione pelo menos um item.');
  const resolved:PreparedOrder['items']=[];let subtotal=0;
  for(const line of lines){
    const catalogId=String(line.catalog_item_id||'').trim();
    const rawQty=Number(line.qty||1);const qty=Math.max(.001,rawQty);
    if(!catalogId||!Number.isFinite(rawQty)||rawQty<=0)throw new Error('Item ou quantidade inválida.');
    const item=await env.DB.prepare(`SELECT id,name,price_cents,stock_control,stock_qty FROM catalog_items WHERE id=? AND tenant_id=? AND active=1 LIMIT 1`).bind(catalogId,tenantId).first<{id:string;name:string;price_cents:number;stock_control:number;stock_qty:number}>();
    if(!item)throw new Error(`Item inválido: ${catalogId}`);
    if(item.stock_control&&item.stock_qty<qty)throw new Error(`Estoque insuficiente para ${item.name}.`);
    const total=Math.round(item.price_cents*qty);subtotal+=total;
    resolved.push({catalog_item_id:item.id,name:item.name,qty,unit_price_cents:item.price_cents,total_cents:total,stock_control:item.stock_control});
  }
  const delivery=cents(args.delivery_cents),discount=Math.min(subtotal+delivery,cents(args.discount_cents));
  return{
    customer_name:String(args.customer_name||'Cliente').trim().slice(0,160)||'Cliente',
    customer_phone:args.customer_phone?String(args.customer_phone).trim().slice(0,60):null,
    items:resolved,subtotal_cents:subtotal,delivery_cents:delivery,discount_cents:discount,total_cents:subtotal+delivery-discount,
    fulfillment_type:String(args.fulfillment_type||'pickup').trim().slice(0,40)||'pickup',
    notes:args.notes?String(args.notes).trim().slice(0,2000):null
  };
}

export async function resolveDefaultWorkflow(env:Env,tenantId:string){
  const row=await env.DB.prepare(`SELECT wt.id workflow_id,ws.step_key,ws.label FROM workflow_templates wt JOIN workflow_steps ws ON ws.workflow_id=wt.id WHERE wt.tenant_id=? ORDER BY wt.is_default DESC,ws.sort_order ASC LIMIT 1`).bind(tenantId).first<{workflow_id:string;step_key:string;label:string}>();
  if(!row)throw new Error('Workflow da empresa não configurado.');
  return row;
}

export async function createOrder(env:Env,tenantId:string,args:Dict,actor:{type:string;id:string;source?:string}){
  const preview=await prepareOrder(env,tenantId,args);const flow=await resolveDefaultWorkflow(env,tenantId);
  let customerId:string|null=null;
  if(preview.customer_phone){const found=await env.DB.prepare('SELECT id FROM customers WHERE tenant_id=? AND phone=? LIMIT 1').bind(tenantId,preview.customer_phone).first<{id:string}>();customerId=found?.id||null;}
  if(!customerId){customerId=makeId('cus');await env.DB.prepare('INSERT INTO customers (id,tenant_id,name,phone) VALUES (?,?,?,?)').bind(customerId,tenantId,preview.customer_name,preview.customer_phone).run();}
  const orderId=makeId('ord');
  const publicCode=`NJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
  const source=(actor.source||'web').slice(0,40);
  const statements:D1PreparedStatement[]=[
    env.DB.prepare(`INSERT INTO orders (id,tenant_id,customer_id,workflow_id,public_code,source,transaction_type,status,subtotal_cents,delivery_cents,discount_cents,total_cents,fulfillment_type,notes) VALUES (?,?,?,?,?,?,'order',?,?,?,?,?,?,?)`).bind(orderId,tenantId,customerId,flow.workflow_id,publicCode,source,flow.step_key,preview.subtotal_cents,preview.delivery_cents,preview.discount_cents,preview.total_cents,preview.fulfillment_type,preview.notes),
    env.DB.prepare(`INSERT INTO order_events (id,order_id,event_type,to_status,actor_type,actor_id,payload_json) VALUES (?,?,'order.created',?,?,?,?)`).bind(makeId('evt'),orderId,flow.step_key,actor.type,actor.id,JSON.stringify({source}))
  ];
  for(const item of preview.items){
    statements.push(env.DB.prepare(`INSERT INTO order_items (id,order_id,catalog_item_id,name,qty,unit_price_cents,total_cents,options_json) VALUES (?,?,?,?,?,?,?,'{}')`).bind(makeId('line'),orderId,item.catalog_item_id,item.name,item.qty,item.unit_price_cents,item.total_cents));
    if(item.stock_control)statements.push(env.DB.prepare(`UPDATE catalog_items SET stock_qty=stock_qty-?,updated_at=datetime('now') WHERE id=? AND tenant_id=? AND active=1 AND stock_control=1 AND stock_qty>=?`).bind(item.qty,item.catalog_item_id,tenantId,item.qty));
  }
  try{await env.DB.batch(statements);}catch(error){const message=error instanceof Error?error.message:String(error);if(message.includes('controlled_stock_cannot_be_negative'))throw new Error('Estoque alterado por outra venda. Revise o pedido e tente novamente.');throw error;}
  return{id:orderId,public_code:publicCode,status:flow.step_key,total_cents:preview.total_cents,workflow_id:flow.workflow_id};
}

export async function changeOrderStatus(env:Env,tenantId:string,args:Dict,actor:{type:string;id:string}){
  const id=String(args.id||'').trim(),next=String(args.status||'').trim();if(!id||!next)throw new Error('Pedido e status são obrigatórios.');
  const current=await env.DB.prepare(`SELECT status,workflow_id FROM orders WHERE id=? AND tenant_id=? LIMIT 1`).bind(id,tenantId).first<{status:string;workflow_id:string|null}>();if(!current)throw new Error('Pedido não encontrado.');
  const workflowId=current.workflow_id||(await resolveDefaultWorkflow(env,tenantId)).workflow_id;
  const valid=await env.DB.prepare(`SELECT ws.step_key FROM workflow_steps ws JOIN workflow_templates wt ON wt.id=ws.workflow_id WHERE wt.tenant_id=? AND wt.id=? AND ws.step_key=? LIMIT 1`).bind(tenantId,workflowId,next).first();
  if(!valid)throw new Error('Etapa inválida para o workflow.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET workflow_id=COALESCE(workflow_id,?),status=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(workflowId,next,id,tenantId),
    env.DB.prepare(`INSERT INTO order_events (id,order_id,event_type,from_status,to_status,actor_type,actor_id) VALUES (?,?,?,?,?,?,?)`).bind(makeId('evt'),id,'order.status.changed',current.status,next,actor.type,actor.id)
  ]);
  return{id,from:current.status,status:next,workflow_id:workflowId};
}
