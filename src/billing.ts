/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Dict,Env,audit,authenticate,body,hmacSha256Hex,json,makeId,resolveTenant,responseTextLimited,safeEqual,slugify} from './lib';

const MP='https://api.mercadopago.com';
const clean=(v:unknown,max=500)=>String(v??'').trim().slice(0,max);

async function mpFetch(env:Env,path:string,opt:RequestInit={}){
  if(!env.MERCADOPAGO_ACCESS_TOKEN)throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.');
  const response=await fetch(`${MP}${path}`,{...opt,headers:{authorization:`Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,'content-type':'application/json',...(opt.headers||{})}});
  const raw=await responseTextLimited(response,12000);let data:any={};try{data=JSON.parse(raw)}catch{}
  if(!response.ok)throw new Error(clean(data?.message||data?.error||raw||`Mercado Pago HTTP ${response.status}`,1000));
  return data;
}

function parseSignature(value:string){const out:Record<string,string>={};for(const part of value.split(',')){const[k,v]=part.trim().split('=',2);if(k&&v)out[k]=v;}return out;}
async function verifyWebhook(request:Request,env:Env,url:URL,payload:any){
  if(!env.MERCADOPAGO_WEBHOOK_SECRET)return false;
  const signature=parseSignature(request.headers.get('x-signature')||'');const ts=signature.ts||'',v1=signature.v1||'';if(!ts||!v1)return false;
  const requestId=request.headers.get('x-request-id')||'';const dataId=clean(url.searchParams.get('data.id')||payload?.data?.id,300);
  const parts:string[]=[];if(dataId)parts.push(`id:${dataId};`);if(requestId)parts.push(`request-id:${requestId};`);if(ts)parts.push(`ts:${ts};`);
  const expected=await hmacSha256Hex(env.MERCADOPAGO_WEBHOOK_SECRET,parts.join(''));
  return safeEqual(expected.toLowerCase(),v1.toLowerCase());
}

function subscriptionState(providerStatus:string){
  if(providerStatus==='authorized')return{subscription:'active',tenant:'active'};
  if(providerStatus==='cancelled')return{subscription:'cancelled',tenant:'suspended'};
  if(providerStatus==='paused')return{subscription:'past_due',tenant:'suspended'};
  return{subscription:'pending_payment',tenant:null};
}
async function syncPreapproval(env:Env,providerId:string){
  const data=await mpFetch(env,`/preapproval/${encodeURIComponent(providerId)}`);
  const subscription=await env.DB.prepare(`SELECT tenant_id,plan_id FROM tenant_subscriptions WHERE provider='mercadopago' AND provider_subscription_id=? LIMIT 1`).bind(providerId).first<{tenant_id:string;plan_id:string}>();
  let tenantId=subscription?.tenant_id||'';let planId=subscription?.plan_id||'';
  if(!tenantId&&typeof data.external_reference==='string'){
    const ref=await env.DB.prepare(`SELECT tenant_id,plan_id FROM billing_checkout_sessions WHERE external_reference=? LIMIT 1`).bind(data.external_reference).first<{tenant_id:string;plan_id:string}>();tenantId=ref?.tenant_id||'';planId=ref?.plan_id||'';
  }
  if(!tenantId)return{ignored:true};
  const mapped=subscriptionState(String(data.status||''));const periodEnd=data.next_payment_date?String(data.next_payment_date):null;
  await env.DB.batch([
    env.DB.prepare(`UPDATE tenant_subscriptions SET plan_id=COALESCE(NULLIF(?,''),plan_id),provider='mercadopago',provider_subscription_id=?,provider_status=?,status=?,current_period_start=CASE WHEN ?='active' THEN COALESCE(current_period_start,datetime('now')) ELSE current_period_start END,current_period_end=COALESCE(?,current_period_end),checkout_url=COALESCE(?,checkout_url),provider_metadata_json=?,last_payment_status=COALESCE(last_payment_status,?),updated_at=datetime('now') WHERE tenant_id=?`).bind(planId,providerId,String(data.status||''),mapped.subscription,mapped.subscription,periodEnd,data.init_point||null,JSON.stringify({payer_id:data.payer_id||null,reason:data.reason||null}),data.status||null,tenantId),
    ...(mapped.tenant?[env.DB.prepare(`UPDATE tenants SET status=? WHERE id=?`).bind(mapped.tenant,tenantId)]:[]),
    env.DB.prepare(`UPDATE billing_checkout_sessions SET provider_reference=?,status=?,checkout_url=COALESCE(?,checkout_url),updated_at=datetime('now') WHERE tenant_id=? AND external_reference=?`).bind(providerId,String(data.status||''),data.init_point||null,tenantId,String(data.external_reference||''))
  ]);
  return{tenant_id:tenantId,status:data.status,subscription_status:mapped.subscription};
}

async function syncPayment(env:Env,paymentId:string){
  const data=await mpFetch(env,`/v1/payments/${encodeURIComponent(paymentId)}`);
  const externalReference=clean(data.external_reference,500);let tenantId='';
  if(externalReference){const ref=await env.DB.prepare(`SELECT tenant_id FROM billing_checkout_sessions WHERE external_reference=? LIMIT 1`).bind(externalReference).first<{tenant_id:string}>();tenantId=ref?.tenant_id||'';}
  if(!tenantId&&data.metadata?.tenant_id)tenantId=clean(data.metadata.tenant_id,120);
  if(!tenantId)return{ignored:true};
  const amountCents=Math.max(0,Math.round(Number(data.transaction_amount||0)*100));
  const existing=await env.DB.prepare(`SELECT id FROM billing_payments WHERE provider='mercadopago' AND provider_payment_id=? LIMIT 1`).bind(paymentId).first<{id:string}>();
  const paymentRowId=existing?.id||makeId('pay');
  if(existing)await env.DB.prepare(`UPDATE billing_payments SET status=?,method=?,amount_cents=?,approved_at=?,metadata_json=?,updated_at=datetime('now') WHERE id=?`).bind(String(data.status||'pending'),clean(data.payment_method_id,80)||null,amountCents,data.status==='approved'?(data.date_approved||new Date().toISOString()):null,JSON.stringify({status_detail:data.status_detail||null}),paymentRowId).run();
  else await env.DB.prepare(`INSERT INTO billing_payments (id,tenant_id,provider,provider_payment_id,status,method,amount_cents,approved_at,metadata_json) VALUES (?,?,'mercadopago',?,?,?,?,?,?)`).bind(paymentRowId,tenantId,paymentId,String(data.status||'pending'),clean(data.payment_method_id,80)||null,amountCents,data.status==='approved'?(data.date_approved||new Date().toISOString()):null,JSON.stringify({status_detail:data.status_detail||null})).run();
  await env.DB.prepare(`UPDATE tenant_subscriptions SET last_payment_status=?,updated_at=datetime('now') WHERE tenant_id=?`).bind(String(data.status||'pending'),tenantId).run();
  if(data.status==='approved')await env.DB.prepare(`UPDATE tenants SET status='active' WHERE id=? AND status IN ('trial','suspended','active')`).bind(tenantId).run();
  return{tenant_id:tenantId,payment_status:data.status};
}

export async function handleBilling(request:Request,env:Env,url:URL):Promise<Response|null>{
  const method=request.method.toUpperCase();
  if(url.pathname==='/webhooks/mercadopago'){
    if(method!=='POST')return json({error:'Método não permitido.'},405);
    let payload:any={};try{payload=await request.json()}catch{return json({error:'JSON inválido.'},400);}
    if(!await verifyWebhook(request,env,url,payload))return json({error:'Webhook não autorizado.'},401);
    const type=clean(payload.type||url.searchParams.get('type'),100),dataId=clean(url.searchParams.get('data.id')||payload?.data?.id,300),eventId=clean(request.headers.get('x-request-id')||payload.id||`${type}:${dataId}:${payload.action||''}`,300);
    if(!type||!dataId)return json({data:{ignored:true}});
    const existing=await env.DB.prepare(`SELECT id,processed FROM payment_events WHERE provider='mercadopago' AND external_event_id=? LIMIT 1`).bind(eventId).first<{id:string;processed:number}>();if(existing?.processed)return json({data:{ok:true,duplicate:true}});
    const eventDbId=existing?.id||makeId('pevt');if(!existing)await env.DB.prepare(`INSERT INTO payment_events (id,provider,external_event_id,event_type,payload_json) VALUES (?,'mercadopago',?,?,?)`).bind(eventDbId,eventId,type,JSON.stringify(payload)).run();
    try{
      let result:unknown={ignored:true};if(type==='subscription_preapproval')result=await syncPreapproval(env,dataId);else if(type==='payment')result=await syncPayment(env,dataId);else if(type==='subscription_authorized_payment'){const invoice=await mpFetch(env,`/authorized_payments/${encodeURIComponent(dataId)}`);if(invoice?.preapproval_id)result=await syncPreapproval(env,String(invoice.preapproval_id));}
      await env.DB.prepare(`UPDATE payment_events SET processed=1,processed_at=datetime('now'),tenant_id=?,error=NULL WHERE id=?`).bind((result as any)?.tenant_id||null,eventDbId).run();return json({data:{ok:true,result}});
    }catch(error){const msg=error instanceof Error?error.message:String(error);await env.DB.prepare(`UPDATE payment_events SET error=? WHERE id=?`).bind(msg.slice(0,1500),eventDbId).run();console.error(JSON.stringify({event:'mercadopago_webhook_failed',type,data_id:dataId,error:msg}));return json({error:'Falha ao processar evento.'},500);}
  }

  if(!url.pathname.startsWith('/api/billing')&&!url.pathname.startsWith('/api/platform/plans'))return null;
  const actor=await authenticate(request,env);if(!actor)return json({error:'Sessão ausente ou expirada.'},401);

  if(url.pathname.startsWith('/api/platform/plans')){
    if(actor.actorType!=='platform_user'||actor.role!=='super_admin')return json({error:'Acesso exclusivo do Super Admin.'},403);
    if(method==='GET'){const rows=await env.DB.prepare(`SELECT id,slug,name,price_cents,billing_cycle,trial_days,grace_days,limits_json,features_json,active,created_at,updated_at FROM platform_plans ORDER BY active DESC,price_cents ASC`).all();return json({data:rows.results||[]});}
    if(method==='POST'){const input=await body(request);const name=clean(input.name,120),slug=slugify(clean(input.slug||name,80));const cycle=['monthly','yearly'].includes(String(input.billing_cycle))?String(input.billing_cycle):'monthly';const price=Math.max(0,Math.round(Number(input.price_cents||0))),trial=Math.max(0,Math.min(90,Math.floor(Number(input.trial_days||0)))),grace=Math.max(0,Math.min(30,Math.floor(Number(input.grace_days||0))));if(!name||!slug||!Number.isFinite(price))return json({error:'Dados do plano inválidos.'},400);const id=makeId('plan');await env.DB.prepare(`INSERT INTO platform_plans (id,slug,name,price_cents,billing_cycle,trial_days,grace_days,limits_json,features_json,active) VALUES (?,?,?,?,?,?,?,? ,?,1)`).bind(id,slug,name,price,cycle,trial,grace,JSON.stringify(input.limits||{}),JSON.stringify(input.features||{})).run();await audit(env,actor,null,'platform.plan.created','platform_plan',id,{slug,price_cents:price});return json({data:{id,slug}},201);}
    const planMatch=url.pathname.match(/^\/api\/platform\/plans\/([^/]+)$/);if(planMatch&&method==='PATCH'){const input=await body(request),id=decodeURIComponent(planMatch[1]);const current=await env.DB.prepare(`SELECT * FROM platform_plans WHERE id=? LIMIT 1`).bind(id).first<any>();if(!current)return json({error:'Plano não encontrado.'},404);const name=input.name===undefined?current.name:clean(input.name,120),price=input.price_cents===undefined?current.price_cents:Math.max(0,Math.round(Number(input.price_cents))),cycle=input.billing_cycle===undefined?current.billing_cycle:(['monthly','yearly'].includes(String(input.billing_cycle))?String(input.billing_cycle):current.billing_cycle),trial=input.trial_days===undefined?current.trial_days:Math.max(0,Math.min(90,Math.floor(Number(input.trial_days)))),grace=input.grace_days===undefined?current.grace_days:Math.max(0,Math.min(30,Math.floor(Number(input.grace_days)))),active=input.active===undefined?current.active:(input.active?1:0);await env.DB.prepare(`UPDATE platform_plans SET name=?,price_cents=?,billing_cycle=?,trial_days=?,grace_days=?,active=?,updated_at=datetime('now') WHERE id=?`).bind(name,price,cycle,trial,grace,active,id).run();await audit(env,actor,null,'platform.plan.updated','platform_plan',id,{active:Boolean(active),price_cents:price});return json({data:{id,ok:true}});}
    return json({error:'Método não permitido.'},405);
  }

  const tenantId=await resolveTenant(request,env,actor);if(!tenantId)return json({error:'Selecione uma empresa.'},409);
  if(method==='GET'&&url.pathname==='/api/billing/status'){
    const subscription=await env.DB.prepare(`SELECT sub.*,pl.slug plan_slug,pl.name plan_name,pl.price_cents,pl.billing_cycle,pl.trial_days,pl.grace_days FROM tenant_subscriptions sub JOIN platform_plans pl ON pl.id=sub.plan_id WHERE sub.tenant_id=? LIMIT 1`).bind(tenantId).first();const plans=await env.DB.prepare(`SELECT id,slug,name,price_cents,billing_cycle,trial_days,grace_days,features_json FROM platform_plans WHERE active=1 ORDER BY price_cents ASC`).all();return json({data:{subscription,plans:plans.results||[],provider_ready:Boolean(env.MERCADOPAGO_ACCESS_TOKEN),webhook_ready:Boolean(env.MERCADOPAGO_WEBHOOK_SECRET)}});
  }
  if(method==='POST'&&url.pathname==='/api/billing/checkout'){
    if(actor.role!=='admin'&&actor.role!=='super_admin')return json({error:'Apenas o administrador pode alterar o plano.'},403);
    if(!env.MERCADOPAGO_ACCESS_TOKEN)return json({error:'Mercado Pago ainda não configurado.'},503);
    const input=await body(request),planId=clean(input.plan_id,120);const plan=await env.DB.prepare(`SELECT id,name,price_cents,billing_cycle,active FROM platform_plans WHERE id=? AND active=1 LIMIT 1`).bind(planId).first<{id:string;name:string;price_cents:number;billing_cycle:string;active:number}>();if(!plan)return json({error:'Plano indisponível.'},404);if(plan.price_cents<=0)return json({error:'Este plano não requer checkout.'},400);
    const subscription=await env.DB.prepare(`SELECT id FROM tenant_subscriptions WHERE tenant_id=? LIMIT 1`).bind(tenantId).first<{id:string}>();if(!subscription)return json({error:'Assinatura base não encontrada.'},409);
    const checkoutId=makeId('checkout'),externalReference=`negociaja:${checkoutId}`;const amount=plan.price_cents/100;const frequency=plan.billing_cycle==='yearly'?12:1;
    const provider=await mpFetch(env,'/preapproval',{method:'POST',body:JSON.stringify({reason:`NegocIAJá! — ${plan.name}`,external_reference:externalReference,payer_email:actor.email,auto_recurring:{frequency,frequency_type:'months',transaction_amount:amount,currency_id:'BRL'},back_url:`${url.origin}/plano?retorno=mercadopago`,status:'pending'})});
    const providerId=clean(provider.id,300),checkoutUrl=clean(provider.init_point,1500);if(!providerId||!checkoutUrl)return json({error:'Mercado Pago não retornou URL de checkout.'},502);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO billing_checkout_sessions (id,tenant_id,subscription_id,plan_id,external_reference,provider_reference,status,checkout_url) VALUES (?,?,?,?,?,?,?,?)`).bind(checkoutId,tenantId,subscription.id,plan.id,externalReference,providerId,String(provider.status||'pending'),checkoutUrl),
      env.DB.prepare(`UPDATE tenant_subscriptions SET plan_id=?,provider='mercadopago',provider_subscription_id=?,provider_status=?,checkout_url=?,status=CASE WHEN status='trial' THEN status ELSE 'pending_payment' END,updated_at=datetime('now') WHERE tenant_id=?`).bind(plan.id,providerId,String(provider.status||'pending'),checkoutUrl,tenantId)
    ]);
    await audit(env,actor,tenantId,'billing.checkout.created','billing_checkout',checkoutId,{plan_id:plan.id,provider:'mercadopago'});return json({data:{checkout_url:checkoutUrl,provider_subscription_id:providerId}},201);
  }
  return json({error:'Endpoint não encontrado.'},404);
}
