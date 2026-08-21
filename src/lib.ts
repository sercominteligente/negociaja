/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
export type Dict = Record<string, unknown>;
export type Role = 'super_admin' | 'admin' | 'operator';
export interface Env { DB: D1Database; FILES: R2Bucket; ASSETS: Fetcher; HML_BOOTSTRAP_TOKEN?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string; }
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
const bytesToBase64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const base64ToBytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function sha256(value:string){return toHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
export async function derivePassword(password:string,saltBase64:string,iterations=PASSWORD_ITERATIONS){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:base64ToBytes(saltBase64),iterations,hash:'SHA-256'},material,256);return bytesToBase64(new Uint8Array(bits));}
export async function createPassword(password:string){const salt=crypto.getRandomValues(new Uint8Array(16));const saltBase64=bytesToBase64(salt);return{salt:saltBase64,hash:await derivePassword(password,saltBase64),iterations:PASSWORD_ITERATIONS};}
export function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function cookieValue(request:Request,name:string){const cookie=request.headers.get('cookie')||'';for(const part of cookie.split(';')){const[key,...rest]=part.trim().split('=');if(key===name)return decodeURIComponent(rest.join('='));}return null;}
export function sessionCookie(token:string,maxAge=SESSION_TTL_SECONDS){return`${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
export function slugify(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);}
export async function audit(env:Env,actor:Actor|null,tenantId:string|null,action:string,entityType?:string,entityId?:string,metadata:Dict={}){await env.DB.prepare(`INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,actor_role,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?,?,?,?)`).bind(makeId('audit'),tenantId,actor?.actorType||'system',actor?.actorId||null,actor?.role||null,action,entityType||null,entityId||null,JSON.stringify(metadata)).run();}
export async function authenticate(request:Request,env:Env):Promise<Actor|null>{const token=cookieValue(request,SESSION_COOKIE);if(!token)return null;const tokenHash=await sha256(token);const row=await env.DB.prepare(`SELECT s.id session_id,s.user_id,s.platform_user_id,s.tenant_id,s.role,u.name user_name,u.email user_email,u.status user_status,p.name platform_name,p.email platform_email,p.status platform_status FROM auth_sessions s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN platform_users p ON p.id=s.platform_user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now') LIMIT 1`).bind(tokenHash).first<{session_id:string;user_id:string|null;platform_user_id:string|null;tenant_id:string|null;role:Role;user_name:string|null;user_email:string|null;user_status:string|null;platform_name:string|null;platform_email:string|null;platform_status:string|null;}>();if(!row)return null;if(row.user_id&&row.user_status!=='active')return null;if(row.platform_user_id&&row.platform_status!=='active')return null;await env.DB.prepare("UPDATE auth_sessions SET last_seen_at=datetime('now') WHERE id=?").bind(row.session_id).run();return{sessionId:row.session_id,actorId:row.user_id||row.platform_user_id||'',actorType:row.user_id?'tenant_user':'platform_user',role:row.role,tenantId:row.tenant_id,name:row.user_name||row.platform_name||'Usuário',email:row.user_email||row.platform_email||''};}
export const hasRole=(actor:Actor,allowed:Role[])=>allowed.includes(actor.role);
export async function resolveTenant(_request:Request,_env:Env,actor:Actor){return actor.tenantId;}
