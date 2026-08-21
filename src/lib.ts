/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
export type Dict = Record<string, unknown>;
export type Role = 'super_admin' | 'admin' | 'operator';
export interface Env { DB: D1Database; FILES: R2Bucket; ASSETS: Fetcher; AGENT_QUEUE?: Queue<unknown>; HML_BOOTSTRAP_TOKEN?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string; CREDENTIALS_KEY?: string; OPENAI_API_KEY?: string; OPENAI_TRANSCRIBE_MODEL?: string; OPENAI_VISION_MODEL?: string; OPENAI_AGENT_MODEL?: string; MERCADOPAGO_ACCESS_TOKEN?: string; MERCADOPAGO_WEBHOOK_SECRET?: string; PUBLIC_APP_URL?: string; }
export type Actor = { sessionId:string; actorId:string; actorType:'platform_user'|'tenant_user'; role:Role; tenantId:string|null; name:string; email:string; };
export const SESSION_COOKIE='negociaja_session';
export const SESSION_TTL_SECONDS=60*60*12;
export const PASSWORD_ITERATIONS=210000;
export const VERIFY_TTL_HOURS=24;
export const json=(data:unknown,status=200,headers:HeadersInit={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
export const makeId=(prefix:string)=>`${prefix}_${crypto.randomUUID()}`;
export async function body(request:Request):Promise<Dict>{try{return await request.json() as Dict;}catch{return {};}}
export const cents=(value:unknown)=>{const n=Number(value??0);return Number.isFinite(n)?Math.max(0,Math.round(n)):0;};
const toHex=(buffer:ArrayBuffer)=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
export const bytesToBase64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
export const base64ToBytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function sha256(value:string){return toHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
export async function hmacSha256Hex(secret:string,value:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return toHex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));}
export async function derivePassword(password:string,saltBase64:string,iterations=PASSWORD_ITERATIONS){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:base64ToBytes(saltBase64),iterations,hash:'SHA-256'},material,256);return bytesToBase64(new Uint8Array(bits));}
export async function createPassword(password:string){const salt=crypto.getRandomValues(new Uint8Array(16));const saltBase64=bytesToBase64(salt);return{salt:saltBase64,hash:await derivePassword(password,saltBase64),iterations:PASSWORD_ITERATIONS};}
export function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export function escapeHtml(value:unknown){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[ch]||ch));}
export async function responseTextLimited(response:Response,max=4000){const text=await response.text();return text.length>max?`${text.slice(0,max)}…`:text;}
function cookieValue(request:Request,name:string){const cookie=request.headers.get('cookie')||'';for(const part of cookie.split(';')){const[key,...rest]=part.trim().split('=');if(key===name)return decodeURIComponent(rest.join('='));}return null;}
export function sessionCookie(token:string,maxAge=SESSION_TTL_SECONDS){return`${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
export function slugify(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);}
export async function audit(env:Env,actor:Actor|null,tenantId:string|null,action:string,entityType?:string,entityId?:string,metadata:Dict={}){await env.DB.prepare(`INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,actor_role,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?,?,?,?)`).bind(makeId('audit'),tenantId,actor?.actorType||'system',actor?.actorId||null,actor?.role||null,action,entityType||null,entityId||null,JSON.stringify(metadata)).run();}

async function expireTenantIfNeeded(env:Env,row:{tenant_id:string|null;tenant_status:string|null;subscription_status:string|null;trial_ends_at:string|null;current_period_end:string|null;grace_days:number|null}){
  if(!row.tenant_id||!['trial','active'].includes(row.tenant_status||''))return false;
  const end=row.subscription_status==='trial'?row.trial_ends_at:row.current_period_end;
  if(!end)return false;
  const endMs=new Date(end).getTime();if(!Number.isFinite(endMs))return false;
  const accessUntil=endMs+Math.max(0,row.grace_days||0)*86400_000;
  if(Date.now()<=accessUntil)return false;
  await env.DB.batch([
    env.DB.prepare(`UPDATE tenants SET status='suspended' WHERE id=? AND status IN ('trial','active')`).bind(row.tenant_id),
    env.DB.prepare(`UPDATE tenant_subscriptions SET status='past_due',grace_until=COALESCE(grace_until,?),updated_at=datetime('now') WHERE tenant_id=? AND status IN ('trial','active')`).bind(new Date(accessUntil).toISOString(),row.tenant_id),
    env.DB.prepare(`UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,datetime('now')) WHERE tenant_id=?`).bind(row.tenant_id)
  ]);
  return true;
}

export async function authenticate(request:Request,env:Env):Promise<Actor|null>{
  const token=cookieValue(request,SESSION_COOKIE);if(!token)return null;
  const tokenHash=await sha256(token);
  const row=await env.DB.prepare(`SELECT s.id session_id,s.user_id,s.platform_user_id,s.tenant_id,s.role,s.expires_at,s.revoked_at,u.name user_name,u.email user_email,u.status user_status,pu.name platform_name,pu.email platform_email,pu.status platform_status,t.status tenant_status,sub.status subscription_status,sub.trial_ends_at,sub.current_period_end,p.grace_days FROM auth_sessions s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN platform_users pu ON pu.id=s.platform_user_id LEFT JOIN tenants t ON t.id=s.tenant_id LEFT JOIN tenant_subscriptions sub ON sub.tenant_id=s.tenant_id LEFT JOIN platform_plans p ON p.id=sub.plan_id WHERE s.token_hash=? LIMIT 1`).bind(tokenHash).first<any>();
  if(!row||row.revoked_at||new Date(row.expires_at).getTime()<Date.now())return null;
  if(row.user_id){if(row.user_status!=='active'||!['trial','active'].includes(row.tenant_status||''))return null;if(await expireTenantIfNeeded(env,row))return null;return{sessionId:row.session_id,actorId:row.user_id,actorType:'tenant_user',role:row.role,tenantId:row.tenant_id,name:row.user_name,email:row.user_email};}
  if(row.platform_user_id&&row.platform_status==='active')return{sessionId:row.session_id,actorId:row.platform_user_id,actorType:'platform_user',role:row.role,tenantId:row.tenant_id,name:row.platform_name,email:row.platform_email};return null;
}
export async function resolveTenant(_request:Request,env:Env,actor:Actor){if(actor.actorType==='tenant_user')return actor.tenantId;if(actor.actorType==='platform_user'&&actor.role==='super_admin'){if(!actor.tenantId)return null;const tenant=await env.DB.prepare(`SELECT id FROM tenants WHERE id=? AND status IN ('trial','active') LIMIT 1`).bind(actor.tenantId).first<{id:string}>();return tenant?.id||null;}return null;}
export function hasRole(actor:Actor,roles:Role[]){return roles.includes(actor.role);}
