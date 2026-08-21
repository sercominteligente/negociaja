/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Dict,Env,VERIFY_TTL_HOURS,audit,body,createPassword,escapeHtml,json,makeId,responseTextLimited,sha256,slugify} from './lib';

const SEGMENT_CORE:Record<string,string>={
  loja:'loja',moda:'loja',calcados:'loja',acessorios:'loja',cosmeticos:'loja',eletronicos:'loja',celulares:'loja',moveis:'loja','construcao-varejo':'loja',autopecas:'loja',petshop:'loja',papelaria:'loja',livraria:'loja',presentes:'loja',brinquedos:'loja',mercado:'loja',conveniencia:'loja','farmacia-varejo':'loja',atacado:'loja',ecommerce:'loja',
  restaurante:'delivery',delivery:'delivery',pizzaria:'delivery',hamburgueria:'delivery',padaria:'delivery',cafeteria:'delivery',bar:'delivery',marmitaria:'delivery',acai:'delivery',churrascaria:'delivery',doces:'delivery',
  'comunicacao-visual':'comunicacao-visual',servicos:'servicos',marketing:'servicos',design:'servicos','foto-video':'servicos','assistencia-tecnica':'servicos',ti:'servicos',limpeza:'servicos',seguranca:'servicos',contabilidade:'servicos',consultoria:'servicos',advocacia:'servicos',imobiliaria:'servicos',turismo:'servicos',eventos:'servicos',educacao:'servicos',academia:'servicos',salao:'servicos',estetica:'servicos','banho-tosa':'servicos',oficina:'servicos',lavajato:'servicos',logistica:'servicos',reformas:'servicos',marcenaria:'servicos',locacao:'servicos',
  ong:'custom',artesao:'custom',industria:'custom',software:'custom',other:'custom'
};

async function queueEmail(env:Env,tenantId:string,destination:string,templateKey:string,payload:Dict){const id=makeId('notify');await env.DB.prepare(`INSERT INTO notification_deliveries (id,tenant_id,channel,template_key,destination,status,payload_json) VALUES (?,?,'email',?,?,'pending',?)`).bind(id,tenantId,templateKey,destination,JSON.stringify(payload)).run();return id;}
async function deliver(env:Env,tenantId:string,email:string,name:string,verifyUrl:string){const deliveryId=await queueEmail(env,tenantId,email,'signup_verify_email',{name,verify_url:verifyUrl});if(!env.RESEND_API_KEY||!env.EMAIL_FROM)return{sent:false};const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM,to:[email],subject:'Confirme seu acesso ao NegocIAJá!',html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Bem-vindo ao NegocIAJá!</h2><p>Olá, ${escapeHtml(name)}. Confirme seu e-mail para ativar sua empresa e iniciar seu período de teste.</p><p><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;padding:14px 22px;background:#169CFF;color:white;text-decoration:none;border-radius:8px">Confirmar meu e-mail</a></p><p>Este link expira em ${VERIFY_TTL_HOURS} horas.</p></div>`})});if(!response.ok){await env.DB.prepare(`UPDATE notification_deliveries SET status='failed',last_error=? WHERE id=?`).bind(await responseTextLimited(response,1000),deliveryId).run();return{sent:false};}const result=await response.json() as{id?:string};await env.DB.prepare(`UPDATE notification_deliveries SET status='sent',provider_reference=?,sent_at=datetime('now') WHERE id=?`).bind(result.id||null,deliveryId).run();return{sent:true};}

export async function handleEnhancedSignup(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(request.method.toUpperCase()!=='POST'||url.pathname!=='/api/auth/signup')return null;
  const input=await body(request),companyName=String(input.company_name||'').trim().slice(0,160),name=String(input.name||'').trim().slice(0,160),email=String(input.email||'').trim().toLowerCase().slice(0,254),password=String(input.password||''),requested=String(input.segment||'').trim(),other=String(input.segment_other||'').trim().slice(0,100),providedLabel=String(input.segment_label||'').trim().slice(0,120);
  if(!companyName||!name||!email||!email.includes('@')||password.length<10||password.length>256)return json({error:'Informe empresa, nome, e-mail válido e senha entre 10 e 256 caracteres.'},400);
  if(!SEGMENT_CORE[requested])return json({error:'Selecione um segmento válido.'},400);
  if(requested==='other'&&(other.length<2||other.length>100))return json({error:'Informe o segmento da sua empresa.'},400);
  const coreSegment=SEGMENT_CORE[requested],segmentLabel=requested==='other'?other:(providedLabel||requested).slice(0,120);
  const existingEmail=await env.DB.prepare('SELECT id FROM users WHERE lower(email)=? LIMIT 1').bind(email).first<{id:string}>();if(existingEmail)return json({error:'Já existe um cadastro com este e-mail.'},409);
  let slugBase=slugify(companyName)||'empresa',slug=slugBase,suffix=1;while(await env.DB.prepare('SELECT id FROM tenants WHERE slug=? LIMIT 1').bind(slug).first())slug=`${slugBase}-${++suffix}`;
  const tenantId=makeId('tenant'),userId=makeId('user'),verificationId=makeId('verify'),rawToken=`${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-',''),tokenHash=await sha256(rawToken),credentials=await createPassword(password),expiresAt=new Date(Date.now()+VERIFY_TTL_HOURS*3600_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO tenants (id,slug,name,segment,status) VALUES (?,?,?,?,'pending_email')`).bind(tenantId,slug,companyName,coreSegment),
    env.DB.prepare(`INSERT INTO tenant_settings (tenant_id,public_name,segment_label) VALUES (?,?,?)`).bind(tenantId,companyName,segmentLabel),
    env.DB.prepare(`INSERT INTO users (id,tenant_id,name,email,role,status,password_hash,password_salt,password_iterations) VALUES (?,?,?,?,'admin','pending_email',?,?,?)`).bind(userId,tenantId,name,email,credentials.hash,credentials.salt,credentials.iterations),
    env.DB.prepare(`INSERT INTO email_verifications (id,tenant_id,user_id,email,token_hash,purpose,expires_at) VALUES (?,?,?,?,?,'signup',?)`).bind(verificationId,tenantId,userId,email,tokenHash,expiresAt),
    env.DB.prepare(`INSERT OR IGNORE INTO tenant_subscriptions (id,tenant_id,plan_id,status) VALUES (?,?,'plan_hml','pending_email')`).bind(makeId('sub'),tenantId)
  ]);
  const delivery=await deliver(env,tenantId,email,name,`${url.origin}/confirmar-email?token=${encodeURIComponent(rawToken)}`);await audit(env,null,tenantId,'auth.signup.created','user',userId,{email,segment:coreSegment,segment_label:segmentLabel,email_sent:delivery.sent});return json({data:{ok:true,tenant_slug:slug,email,email_sent:delivery.sent,segment:coreSegment,segment_label:segmentLabel,message:'Cadastro criado. Confirme seu e-mail para ativar a conta.'}},201);
}
