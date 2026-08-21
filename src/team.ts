/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Dict,Env,VERIFY_TTL_HOURS,audit,authenticate,body,createPassword,json,makeId,sha256} from './lib';

async function queueInvite(env:Env,tenantId:string,email:string,name:string,inviteUrl:string){
  const deliveryId=makeId('notify');
  await env.DB.prepare(`INSERT INTO notification_deliveries (id,tenant_id,channel,template_key,destination,status,payload_json) VALUES (?,?,'email','team_invite',?,'pending',?)`).bind(deliveryId,tenantId,email,JSON.stringify({name,invite_url:inviteUrl})).run();
  if(!env.RESEND_API_KEY||!env.EMAIL_FROM)return{queued:true,sent:false};
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM,to:[email],subject:'Você foi convidado para o NegocIAJá!',html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Convite para o NegocIAJá!</h2><p>Olá, ${name}. Você recebeu acesso à equipe de uma empresa no NegocIAJá!.</p><p><a href="${inviteUrl}" style="display:inline-block;padding:14px 22px;background:#169CFF;color:white;text-decoration:none;border-radius:8px">Aceitar convite</a></p><p>Este link expira em ${VERIFY_TTL_HOURS} horas.</p></div>`})});
  if(!response.ok){await env.DB.prepare(`UPDATE notification_deliveries SET status='failed',last_error=? WHERE id=?`).bind((await response.text()).slice(0,1000),deliveryId).run();return{queued:true,sent:false};}
  const result=await response.json() as{id?:string};
  await env.DB.prepare(`UPDATE notification_deliveries SET status='sent',provider_reference=?,sent_at=datetime('now') WHERE id=?`).bind(result.id||null,deliveryId).run();
  return{queued:true,sent:true};
}

export async function handleTeam(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(!url.pathname.startsWith('/api/team'))return null;
  const method=request.method.toUpperCase();

  if((method==='GET'||method==='POST')&&url.pathname==='/api/team/accept-invite'){
    const input=method==='POST'?await body(request):{} as Dict;
    const rawToken=String(input.token||url.searchParams.get('token')||'');
    if(!rawToken)return json({error:'Token do convite ausente.'},400);
    const tokenHash=await sha256(rawToken);
    const invite=await env.DB.prepare(`SELECT ev.id,ev.tenant_id,ev.user_id,ev.email,ev.verified_at,ev.expires_at,u.name,u.role,t.name tenant_name,t.slug tenant_slug FROM email_verifications ev JOIN users u ON u.id=ev.user_id JOIN tenants t ON t.id=ev.tenant_id WHERE ev.token_hash=? AND ev.purpose='team_invite' LIMIT 1`).bind(tokenHash).first<{id:string;tenant_id:string;user_id:string;email:string;verified_at:string|null;expires_at:string;name:string;role:string;tenant_name:string;tenant_slug:string}>();
    if(!invite)return json({error:'Convite inválido.'},400);
    if(invite.verified_at)return json({error:'Este convite já foi utilizado.'},409);
    if(new Date(invite.expires_at).getTime()<Date.now())return json({error:'Convite expirado. Solicite um novo convite ao administrador.'},410);
    if(method==='GET')return json({data:{name:invite.name,email:invite.email,role:invite.role,tenant_name:invite.tenant_name,tenant_slug:invite.tenant_slug}});
    const password=String(input.password||'');
    if(password.length<10)return json({error:'Defina uma senha com pelo menos 10 caracteres.'},400);
    const credentials=await createPassword(password);
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET status='active',password_hash=?,password_salt=?,password_iterations=?,email_verified_at=COALESCE(email_verified_at,datetime('now')) WHERE id=? AND tenant_id=?`).bind(credentials.hash,credentials.salt,credentials.iterations,invite.user_id,invite.tenant_id),
      env.DB.prepare(`UPDATE email_verifications SET verified_at=datetime('now') WHERE id=?`).bind(invite.id)
    ]);
    await audit(env,null,invite.tenant_id,'team.invite.accepted','user',invite.user_id,{email:invite.email,role:invite.role});
    return json({data:{ok:true,tenant_slug:invite.tenant_slug}});
  }

  const actor=await authenticate(request,env);
  if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  if(actor.actorType!=='tenant_user'||!actor.tenantId)return json({error:'Gestão de equipe disponível apenas para empresas autenticadas.'},403);
  if(actor.role!=='admin')return json({error:'Apenas administradores podem gerenciar a equipe.'},403);
  const tenantId=actor.tenantId;

  if(method==='GET'&&url.pathname==='/api/team'){
    const result=await env.DB.prepare(`SELECT id,name,email,role,status,email_verified_at,last_login_at,created_at FROM users WHERE tenant_id=? ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END,name`).bind(tenantId).all();
    return json({data:result.results});
  }

  if(method==='POST'&&url.pathname==='/api/team/invite'){
    const input=await body(request);const name=String(input.name||'').trim();const email=String(input.email||'').trim().toLowerCase();const role=input.role==='admin'?'admin':'operator';
    if(!name||!email)return json({error:'Nome e e-mail são obrigatórios.'},400);
    const existing=await env.DB.prepare('SELECT id,status FROM users WHERE tenant_id=? AND lower(email)=? LIMIT 1').bind(tenantId,email).first<{id:string;status:string}>();
    if(existing&&existing.status==='active')return json({error:'Este usuário já faz parte da equipe.'},409);
    const userId=existing?.id||makeId('user');
    if(existing)await env.DB.prepare(`UPDATE users SET name=?,role=?,status='pending_email',password_hash=NULL,password_salt=NULL WHERE id=? AND tenant_id=?`).bind(name,role,userId,tenantId).run();
    else await env.DB.prepare(`INSERT INTO users (id,tenant_id,name,email,role,status) VALUES (?,?,?,?,?,'pending_email')`).bind(userId,tenantId,name,email,role).run();
    const rawToken=`${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-','');const tokenHash=await sha256(rawToken);const expiresAt=new Date(Date.now()+VERIFY_TTL_HOURS*3600_000).toISOString();
    const old=await env.DB.prepare(`SELECT id FROM email_verifications WHERE tenant_id=? AND user_id=? AND purpose='team_invite' ORDER BY created_at DESC LIMIT 1`).bind(tenantId,userId).first<{id:string}>();
    if(old)await env.DB.prepare(`UPDATE email_verifications SET email=?,token_hash=?,expires_at=?,verified_at=NULL,created_at=datetime('now') WHERE id=?`).bind(email,tokenHash,expiresAt,old.id).run();
    else await env.DB.prepare(`INSERT INTO email_verifications (id,tenant_id,user_id,email,token_hash,purpose,expires_at) VALUES (?,?,?,?,?,'team_invite',?)`).bind(makeId('verify'),tenantId,userId,email,tokenHash,expiresAt).run();
    const inviteUrl=`${url.origin}/aceitar-convite?token=${encodeURIComponent(rawToken)}`;const delivery=await queueInvite(env,tenantId,email,name,inviteUrl);
    await audit(env,actor,tenantId,'team.invite.created','user',userId,{email,role,email_sent:delivery.sent});
    return json({data:{ok:true,user_id:userId,email_sent:delivery.sent}},201);
  }

  const memberRoute=url.pathname.match(/^\/api\/team\/([^/]+)$/);
  if(method==='PATCH'&&memberRoute){
    const id=memberRoute[1];if(id===actor.actorId)return json({error:'Você não pode alterar o próprio perfil por esta tela.'},400);
    const input=await body(request);const current=await env.DB.prepare('SELECT id,role,status FROM users WHERE id=? AND tenant_id=?').bind(id,tenantId).first<{id:string;role:string;status:string}>();if(!current)return json({error:'Usuário não encontrado.'},404);
    const role=input.role===undefined?current.role:(input.role==='admin'?'admin':'operator');const status=input.status===undefined?current.status:(input.status==='suspended'?'suspended':'active');
    await env.DB.prepare('UPDATE users SET role=?,status=? WHERE id=? AND tenant_id=?').bind(role,status,id,tenantId).run();
    if(status==='suspended')await env.DB.prepare(`UPDATE auth_sessions SET revoked_at=datetime('now') WHERE user_id=? AND tenant_id=? AND revoked_at IS NULL`).bind(id,tenantId).run();
    await audit(env,actor,tenantId,'team.member.updated','user',id,{role,status});
    return json({data:{id,role,status}});
  }

  return json({error:'Endpoint não encontrado.'},404);
}
