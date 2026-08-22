/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Actor,Env,PASSWORD_ITERATIONS,SESSION_TTL_SECONDS,audit,body,derivePassword,json,makeId,safeEqual,sessionCookie,sha256} from './lib';

type TenantLoginRow={id:string;name:string;role:'super_admin'|'admin'|'operator';status:string;password_hash:string|null;password_salt:string|null;password_iterations:number|null;tenant_id:string;tenant_status:string;tenant_slug:string};
type PlatformLoginRow={id:string;name:string;role:'super_admin'|'admin'|'operator';status:string;password_hash:string|null;password_salt:string|null;password_iterations:number|null};

async function createSession(request:Request,env:Env,actor:{id:string;name:string;email:string;role:'super_admin'|'admin'|'operator';tenantId:string|null;type:Actor['actorType']}){
  const rawToken=`${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-','');
  const tokenHash=await sha256(rawToken),sessionId=makeId('sess'),expires=new Date(Date.now()+SESSION_TTL_SECONDS*1000).toISOString();
  const ip=request.headers.get('cf-connecting-ip')||'',ipHash=ip?await sha256(ip):null;
  await env.DB.prepare(`INSERT INTO auth_sessions (id,token_hash,user_id,platform_user_id,tenant_id,role,expires_at,ip_hash,user_agent) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(sessionId,tokenHash,actor.type==='tenant_user'?actor.id:null,actor.type==='platform_user'?actor.id:null,actor.tenantId,actor.role,expires,ipHash,(request.headers.get('user-agent')||'').slice(0,500)).run();
  if(actor.type==='tenant_user')await env.DB.prepare("UPDATE users SET last_login_at=datetime('now') WHERE id=?").bind(actor.id).run();
  else await env.DB.prepare("UPDATE platform_users SET last_login_at=datetime('now') WHERE id=?").bind(actor.id).run();
  const auditActor:Actor={sessionId,actorId:actor.id,actorType:actor.type,role:actor.role,tenantId:actor.tenantId,name:actor.name,email:actor.email};
  await audit(env,auditActor,actor.tenantId,'auth.login',actor.type,actor.id);
  return json({data:{user:{id:actor.id,name:actor.name,email:actor.email,role:actor.role,tenant_id:actor.tenantId}}},200,{'set-cookie':sessionCookie(rawToken)});
}

async function passwordOk(password:string,row:{password_hash:string|null;password_salt:string|null;password_iterations:number|null}){
  if(!row.password_hash||!row.password_salt)return false;
  const derived=await derivePassword(password,row.password_salt,row.password_iterations||PASSWORD_ITERATIONS);
  return safeEqual(derived,row.password_hash);
}

export async function handleEnhancedLogin(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(request.method.toUpperCase()!=='POST'||url.pathname!=='/api/auth/login')return null;
  const input=await body(request),email=String(input.email||'').trim().toLowerCase().slice(0,254),password=String(input.password||''),tenantSlug=String(input.tenant_slug||'').trim(),scope=String(input.scope||'tenant');
  if(!email||!email.includes('@')||!password||password.length>256)return json({error:'Informe seu e-mail e senha.'},400);

  if(scope==='platform'){
    const user=await env.DB.prepare(`SELECT id,name,role,status,password_hash,password_salt,password_iterations FROM platform_users WHERE lower(email)=? LIMIT 1`).bind(email).first<PlatformLoginRow>();
    if(!user||user.status!=='active'||user.role!=='super_admin'||!(await passwordOk(password,user)))return json({error:'E-mail ou senha inválidos para o Super Admin.'},401);
    return createSession(request,env,{id:user.id,name:user.name,email,role:user.role,tenantId:null,type:'platform_user'});
  }

  let candidates:TenantLoginRow[]=[];
  if(tenantSlug){
    const r=await env.DB.prepare(`SELECT u.id,u.name,u.role,u.status,u.password_hash,u.password_salt,u.password_iterations,t.id tenant_id,t.status tenant_status,t.slug tenant_slug FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE lower(u.email)=? AND lower(t.slug)=lower(?) LIMIT 2`).bind(email,tenantSlug).all<TenantLoginRow>();
    candidates=r.results||[];
  }else{
    const r=await env.DB.prepare(`SELECT u.id,u.name,u.role,u.status,u.password_hash,u.password_salt,u.password_iterations,t.id tenant_id,t.status tenant_status,t.slug tenant_slug FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE lower(u.email)=? ORDER BY u.created_at DESC LIMIT 3`).bind(email).all<TenantLoginRow>();
    candidates=r.results||[];
  }

  if(!candidates.length)return json({error:'E-mail ou senha inválidos.'},401);
  if(!tenantSlug&&candidates.length>1)return json({error:'Este e-mail está ligado a mais de uma empresa. Informe o identificador da empresa.',code:'TENANT_REQUIRED'},409);
  const user=candidates[0];
  if(user.status==='pending_email'||user.tenant_status==='pending_email')return json({error:'Confirme seu e-mail antes de entrar.',code:'EMAIL_CONFIRMATION_PENDING'},403);
  if(!['trial','active'].includes(user.tenant_status))return json({error:'O acesso desta empresa está suspenso. Fale com o responsável pela conta.',code:'TENANT_SUSPENDED'},403);
  if(user.status!=='active'||!(await passwordOk(password,user)))return json({error:'E-mail ou senha inválidos.'},401);
  return createSession(request,env,{id:user.id,name:user.name,email,role:user.role,tenantId:user.tenant_id,type:'tenant_user'});
}
