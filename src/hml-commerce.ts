import app from './hml-final';

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
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
}

type Session={tenant_id?:string;email?:string;role?:string;global_role?:string};
type Dict=Record<string,unknown>;
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const id=(p:string)=>`${p}_${crypto.randomUUID()}`;
const clean=(v:unknown,max=500)=>String(v??'').trim().slice(0,max);
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const canBill=(s:Session)=>s.global_role==='super_admin'||s.role==='owner'||s.role==='admin';

async function sha256(value:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
async function sessionFor(request:Request,env:Env):Promise<{session?:Session;response?:Response}>{const r=await app.fetch(new Request(new URL('/api/session',request.url).toString(),{method:'GET',headers:request.headers}),env);if(!r.ok)return{response:r};const p=await r.clone().json().catch(()=>({})) as {data?:Session};return{session:p.data||{}};}
async function readJson(request:Request,requireOrigin=true):Promise<Dict>{if(requireOrigin){const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin)throw new Response(JSON.stringify({error:'Origem não autorizada.'}),{status:403,headers:{'content-type':'application/json'}});}if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))throw new Response(JSON.stringify({error:'Envie application/json.'}),{status:415,headers:{'content-type':'application/json'}});const text=await request.text();if(text.length>65536)throw new Response(JSON.stringify({error:'Corpo muito grande.'}),{status:413,headers:{'content-type':'application/json'}});try{const v=JSON.parse(text||'{}');if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v as Dict}catch{throw new Response(JSON.stringify({error:'JSON inválido.'}),{status:400,headers:{'content-type':'application/json'}});}}
function slugify(value:string){const base=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'empresa';return `${base}-${crypto.randomUUID().slice(0,6)}`;}
function basicAuthorized(request:Request,env:Env){const h=request.headers.get('authorization');if(!env.HML_PASSWORD||!h?.startsWith('Basic '))return false;try{const d=atob(h.slice(6));const i=d.indexOf(':');return i>0&&d.slice(0,i)===(env.HML_USERNAME||'homologacao')&&d.slice(i+1)===env.HML_PASSWORD}catch{return false;}}

async function sendVerificationEmail(env:Env,to:string,company:string,url:string,deliveryId:string){
  if(!env.RESEND_API_KEY)return{sent:false,provider:'development'};
  const from=env.RESEND_FROM_EMAIL||'NegocIAJá! <onboarding@negociaja.com.br>';
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':deliveryId},body:JSON.stringify({from,to:[to],subject:'Confirme sua adesão ao NegocIAJá!',html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h1>Bem-vindo ao NegocIAJá!</h1><p>Recebemos a adesão de <strong>${company.replace(/[<>&]/g,'')}</strong>.</p><p>Confirme seu e-mail para liberar o período de homologação e iniciar o onboarding.</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#1269e8;color:#fff;text-decoration:none;border-radius:10px">Confirmar meu e-mail</a></p><p>Se você não solicitou este cadastro, ignore esta mensagem.</p></div>`})});
  const payload=await response.json().catch(()=>({})) as Dict;if(!response.ok)throw new Error(`Resend ${response.status}: ${clean(payload.message||payload.name||'falha ao enviar',300)}`);return{sent:true,provider:'resend',reference:clean(payload.id,180)};
}

async function signupRequest(request:Request,env:Env){
  if(env.APP_ENVIRONMENT==='hml'&&!basicAuthorized(request,env))return app.fetch(request,env);
  const input=await readJson(request);const company=clean(input.company_name,180);const name=clean(input.name,160);const email=clean(input.email,254).toLowerCase();const segment=clean(input.segment,60)||'custom';
  if(!company||!name||!email.includes('@'))return json({error:'Empresa, nome e e-mail válidos são obrigatórios.'},400);
  const exists=await env.DB.prepare('SELECT id FROM platform_users WHERE lower(email)=lower(?) LIMIT 1').bind(email).first();if(exists)return json({error:'Este e-mail já possui cadastro ou convite.'},409);
  const tenantId=id('tenant');const userId=id('usr');const platformUserId=id('puser');const membershipId=id('membership');const verificationId=id('verify');const token=`njv_${crypto.randomUUID()}_${crypto.randomUUID()}`;const tokenHash=await sha256(token);const slug=slugify(company);const verificationUrl=`${new URL(request.url).origin}/verify-email.html?token=${encodeURIComponent(token)}`;const deliveryId=id('mail');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenants (id,slug,name,segment,status) VALUES (?,?,?,?,'pending_email')").bind(tenantId,slug,company,segment),
    env.DB.prepare("INSERT INTO users (id,tenant_id,name,email,role,status) VALUES (?,?,?,?,'admin','invited')").bind(userId,tenantId,name,email),
    env.DB.prepare("INSERT INTO platform_users (id,email,name,global_role,status) VALUES (?,?,?,'member','invited')").bind(platformUserId,email,name),
    env.DB.prepare("INSERT INTO tenant_memberships (id,tenant_id,platform_user_id,role,permissions_json,status) VALUES (?,?,?,'owner','[\"*\"]','invited')").bind(membershipId,tenantId,platformUserId),
    env.DB.prepare("INSERT INTO email_verifications (id,tenant_id,user_id,email,token_hash,purpose,expires_at) VALUES (?,?,?,?,?,'signup',datetime('now','+24 hour'))").bind(verificationId,tenantId,userId,email,tokenHash),
    env.DB.prepare("INSERT INTO notification_deliveries (id,tenant_id,channel,template_key,destination,status,payload_json) VALUES (?,?,'email','signup.verify',?,'pending',?)").bind(deliveryId,tenantId,email,JSON.stringify({verification_id:verificationId})),
    env.DB.prepare("INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,payload_json) VALUES (?,?,'user',?,'signup.requested','tenant',?,?)").bind(id('audit'),tenantId,email,tenantId,JSON.stringify({segment}))
  ]);
  try{const delivery=await sendVerificationEmail(env,email,company,verificationUrl,deliveryId);await env.DB.prepare("UPDATE notification_deliveries SET status=?,provider_reference=?,sent_at=CASE WHEN ?='sent' THEN datetime('now') ELSE NULL END,last_error=NULL WHERE id=?").bind(delivery.sent?'sent':'development',delivery.reference||null,delivery.sent?'sent':'development',deliveryId).run();return json({data:{tenant_id:tenantId,status:'pending_email',email_sent:delivery.sent,verification_url:delivery.sent?null:verificationUrl}},201);}catch(error){await env.DB.prepare("UPDATE notification_deliveries SET status='failed',last_error=? WHERE id=?").bind(clean(error instanceof Error?error.message:error,1000),deliveryId).run();return json({data:{tenant_id:tenantId,status:'pending_email',email_sent:false,verification_url:env.APP_ENVIRONMENT==='hml'?verificationUrl:null},warning:'Cadastro criado, mas o e-mail não foi enviado.'},201);}
}

async function verifySignup(request:Request,env:Env){
  if(env.APP_ENVIRONMENT==='hml'&&!basicAuthorized(request,env))return app.fetch(request,env);
  const input=await readJson(request);const token=clean(input.token,300);if(!token)return json({error:'Token obrigatório.'},400);const hash=await sha256(token);
  const row=await env.DB.prepare("SELECT ev.id,ev.tenant_id,ev.user_id,ev.email,u.name FROM email_verifications ev LEFT JOIN users u ON u.id=ev.user_id WHERE ev.token_hash=? AND ev.verified_at IS NULL AND ev.expires_at>datetime('now') LIMIT 1").bind(hash).first<{id:string;tenant_id:string;user_id:string;email:string;name:string}>();if(!row)return json({error:'Link inválido, expirado ou já utilizado.'},400);
  const plan=await env.DB.prepare("SELECT id,trial_days FROM platform_plans WHERE active=1 ORDER BY CASE WHEN slug='hml' THEN 0 ELSE 1 END LIMIT 1").first<{id:string;trial_days:number}>();if(!plan)return json({error:'Nenhum plano disponível.'},503);const subId=id('sub');const days=Math.max(1,Number(plan.trial_days||7));
  await env.DB.batch([
    env.DB.prepare("UPDATE email_verifications SET verified_at=datetime('now') WHERE id=?").bind(row.id),
    env.DB.prepare("UPDATE tenants SET status='active' WHERE id=?").bind(row.tenant_id),
    env.DB.prepare("UPDATE users SET status='active' WHERE id=?").bind(row.user_id),
    env.DB.prepare("UPDATE platform_users SET status='active' WHERE lower(email)=lower(?)").bind(row.email),
    env.DB.prepare("UPDATE tenant_memberships SET status='active' WHERE tenant_id=? AND platform_user_id IN (SELECT id FROM platform_users WHERE lower(email)=lower(?))").bind(row.tenant_id,row.email),
    env.DB.prepare("INSERT OR IGNORE INTO tenant_subscriptions (id,tenant_id,plan_id,status,trial_ends_at,current_period_start,current_period_end) VALUES (?,?,?,'trialing',datetime('now','+'||?||' day'),datetime('now'),datetime('now','+'||?||' day'))").bind(subId,row.tenant_id,plan.id,days,days),
    env.DB.prepare("INSERT INTO notification_preferences (tenant_id) VALUES (?) ON CONFLICT(tenant_id) DO NOTHING").bind(row.tenant_id),
    env.DB.prepare("INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,payload_json) VALUES (?,?,'user',?,'signup.email_verified','tenant',?,'{}')").bind(id('audit'),row.tenant_id,row.email,row.tenant_id)
  ]);
  return json({data:{tenant_id:row.tenant_id,status:'trialing',trial_days:days,message:'E-mail confirmado. Empresa liberada para onboarding.'}});
}

async function createPix(request:Request,env:Env){
  const auth=await sessionFor(request,env);if(auth.response)return auth.response;const session=auth.session||{};if(!canBill(session))return json({error:'Apenas proprietário ou administrador pode gerar cobrança.'},403);const tenantId=session.tenant_id||env.DEFAULT_TENANT_ID;if(!tenantId)return json({error:'Tenant indisponível.'},403);await readJson(request);
  if(!env.MERCADOPAGO_ACCESS_TOKEN)return json({error:'Mercado Pago ainda não está configurado nesta HML.',code:'provider_not_configured'},503);
  const [sub,business]=await Promise.all([
    env.DB.prepare("SELECT s.id,s.plan_id,p.name,p.price_monthly_cents FROM tenant_subscriptions s LEFT JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=? LIMIT 1").bind(tenantId).first<{id:string;plan_id:string;name:string;price_monthly_cents:number}>(),
    env.DB.prepare('SELECT legal_name,trade_name,document_number,email FROM tenant_business_profile WHERE tenant_id=? LIMIT 1').bind(tenantId).first<{legal_name:string;trade_name:string;document_number:string;email:string}>()
  ]);if(!sub)return json({error:'Assinatura não configurada.'},404);const amount=Math.max(0,Number(sub.price_monthly_cents||0));if(amount<=0)return json({error:'Este plano não possui valor de renovação configurado.'},409);const payerEmail=clean(business?.email||session.email,254);if(!payerEmail.includes('@'))return json({error:'Cadastre um e-mail válido em Minha Empresa antes de gerar o Pix.'},409);
  const invoiceId=id('inv');const paymentId=id('pay');const idempotencyKey=crypto.randomUUID();const document=clean(business?.document_number,30).replace(/\D/g,'');const payer:Dict={email:payerEmail};if(document)payer.identification={type:document.length>11?'CNPJ':'CPF',number:document};const notificationUrl=`${new URL(request.url).origin}/api/webhooks/mercadopago`;
  await env.DB.prepare("INSERT INTO billing_invoices (id,tenant_id,subscription_id,status,amount_cents,currency,due_at,provider,metadata_json) VALUES (?,?,?,'open',?,'BRL',datetime('now','+1 day'),'mercadopago',?)").bind(invoiceId,tenantId,sub.id,amount,JSON.stringify({plan_id:sub.plan_id})).run();
  const mp=await fetch('https://api.mercadopago.com/v1/payments',{method:'POST',headers:{Authorization:`Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,'Content-Type':'application/json','X-Idempotency-Key':idempotencyKey},body:JSON.stringify({transaction_amount:amount/100,description:`NegocIAJá - ${sub.name||'Plano'}`,payment_method_id:'pix',external_reference:invoiceId,notification_url:notificationUrl,payer})});const payload=await mp.json().catch(()=>({})) as any;
  if(!mp.ok){await env.DB.prepare("UPDATE billing_invoices SET status='failed',metadata_json=?,updated_at=datetime('now') WHERE id=?").bind(JSON.stringify({provider_error:payload}),invoiceId).run();return json({error:'Mercado Pago recusou a criação da cobrança.',details:clean(payload?.message||payload?.error,300)},502);}
  const transaction=payload?.point_of_interaction?.transaction_data||{};await env.DB.batch([
    env.DB.prepare("INSERT INTO billing_payments (id,tenant_id,invoice_id,provider,provider_payment_id,status,method,amount_cents,pix_code,pix_qr_data,payment_url,expires_at,metadata_json) VALUES (?,?,?,'mercadopago',? ,?,'pix',?,?,?,?,datetime('now','+1 day'),?)").bind(paymentId,tenantId,invoiceId,String(payload.id||''),clean(payload.status,40)||'pending',amount,clean(transaction.qr_code,5000)||null,clean(transaction.qr_code_base64,200000)||null,clean(transaction.ticket_url,1200)||null,JSON.stringify({idempotency_key:idempotencyKey})),
    env.DB.prepare("UPDATE billing_invoices SET provider_reference=?,metadata_json=?,updated_at=datetime('now') WHERE id=?").bind(String(payload.id||''),JSON.stringify({idempotency_key:idempotencyKey}),invoiceId),
    env.DB.prepare("INSERT INTO platform_billing_events (id,tenant_id,subscription_id,event_type,amount_cents,status,provider,provider_reference,due_at,metadata_json) VALUES (?,?,?,'payment.pix.created',?,'pending','mercadopago',?,datetime('now','+1 day'),?)").bind(id('bill'),tenantId,sub.id,amount,String(payload.id||''),JSON.stringify({invoice_id:invoiceId}))
  ]);
  return json({data:{invoice_id:invoiceId,payment_id:paymentId,provider_payment_id:String(payload.id||''),status:clean(payload.status,40),amount_cents:amount,qr_code:transaction.qr_code||null,qr_code_base64:transaction.qr_code_base64||null,ticket_url:transaction.ticket_url||null}},201);
}

function constantEqual(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
async function verifyMpSignature(request:Request,env:Env,url:URL){if(!env.MERCADOPAGO_WEBHOOK_SECRET)return false;const signature=request.headers.get('x-signature')||'';const requestId=request.headers.get('x-request-id')||'';const dataId=url.searchParams.get('data.id')||'';let ts='',v1='';for(const part of signature.split(',')){const [k,...rest]=part.trim().split('=');const value=rest.join('=');if(k==='ts')ts=value;if(k==='v1')v1=value;}if(!ts||!v1||!requestId||!dataId)return false;const manifest=`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.MERCADOPAGO_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(manifest)));return constantEqual(expected,v1.toLowerCase());}

async function mpWebhook(request:Request,env:Env,url:URL){
  if(!env.MERCADOPAGO_ACCESS_TOKEN||!env.MERCADOPAGO_WEBHOOK_SECRET)return json({error:'Webhook provider não configurado.'},503);if(!(await verifyMpSignature(request,env,url)))return json({error:'Assinatura inválida.'},401);const input=await readJson(request,false);const data=(input.data&&typeof input.data==='object'?input.data:{}) as Dict;const providerId=clean(data.id||url.searchParams.get('data.id'),100);if(!providerId)return json({ok:true});const externalEventId=`${clean(input.type,80)||'payment'}:${providerId}:${clean(input.action,120)||'update'}`;const exists=await env.DB.prepare("SELECT id FROM payment_events WHERE provider='mercadopago' AND external_event_id=? LIMIT 1").bind(externalEventId).first();if(exists)return json({ok:true,duplicate:true});
  const mp=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(providerId)}`,{headers:{Authorization:`Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`}});const payment=await mp.json().catch(()=>({})) as any;if(!mp.ok)return json({error:'Não foi possível validar o pagamento no provider.'},502);const invoiceId=clean(payment.external_reference,180);const invoice=invoiceId?await env.DB.prepare('SELECT id,tenant_id,subscription_id,amount_cents FROM billing_invoices WHERE id=? LIMIT 1').bind(invoiceId).first<{id:string;tenant_id:string;subscription_id:string;amount_cents:number}>():null;if(!invoice){await env.DB.prepare("INSERT INTO payment_events (id,provider,external_event_id,event_type,payload_json,processed,error) VALUES (?,'mercadopago',?,?,?,1,'invoice_not_found')").bind(id('pevt'),externalEventId,clean(input.type,80)||'payment',JSON.stringify({provider_payment_id:providerId})).run();return json({ok:true,unmatched:true});}
  const status=clean(payment.status,40)||'unknown';const approved=status==='approved';await env.DB.batch([
    env.DB.prepare("INSERT INTO payment_events (id,provider,external_event_id,event_type,tenant_id,payload_json,processed,processed_at) VALUES (?,'mercadopago',?,?,?,?,1,datetime('now'))").bind(id('pevt'),externalEventId,clean(input.type,80)||'payment',invoice.tenant_id,JSON.stringify({provider_payment_id:providerId,status})),
    env.DB.prepare("UPDATE billing_payments SET status=?,approved_at=CASE WHEN ?=1 THEN datetime('now') ELSE approved_at END,updated_at=datetime('now') WHERE provider='mercadopago' AND provider_payment_id=?").bind(status,approved?1:0,providerId),
    env.DB.prepare("UPDATE billing_invoices SET status=?,paid_at=CASE WHEN ?=1 THEN datetime('now') ELSE paid_at END,updated_at=datetime('now') WHERE id=?").bind(approved?'paid':status,approved?1:0,invoice.id),
    env.DB.prepare("UPDATE platform_billing_events SET status=?,paid_at=CASE WHEN ?=1 THEN datetime('now') ELSE paid_at END WHERE tenant_id=? AND provider='mercadopago' AND provider_reference=?").bind(approved?'paid':status,approved?1:0,invoice.tenant_id,providerId),
    ...(approved?[env.DB.prepare("UPDATE tenant_subscriptions SET status='active',current_period_start=datetime('now'),current_period_end=datetime(CASE WHEN current_period_end>datetime('now') THEN current_period_end ELSE datetime('now') END,'+1 month'),last_payment_status='approved',updated_at=datetime('now') WHERE id=?").bind(invoice.subscription_id),env.DB.prepare("UPDATE tenants SET status='active' WHERE id=?").bind(invoice.tenant_id)]:[])
  ]);return json({ok:true,status,approved});
}

export default{async fetch(request:Request,env:Env):Promise<Response>{try{const url=new URL(request.url);if(url.pathname==='/api/webhooks/mercadopago'&&request.method==='POST')return mpWebhook(request,env,url);if(url.pathname==='/api/signup/request'&&request.method==='POST')return signupRequest(request,env);if(url.pathname==='/api/signup/verify'&&request.method==='POST')return verifySignup(request,env);if(url.pathname==='/api/billing/pix'&&request.method==='POST')return createPix(request,env);return app.fetch(request,env);}catch(error){if(error instanceof Response)return error;console.error('HML commerce gateway error',error);return json({error:'Erro interno no ciclo comercial.'},500);}}};
