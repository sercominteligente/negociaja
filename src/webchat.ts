/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,json,makeId,sha256} from './lib';

const WEBCHAT_TTL_DAYS=7;
const clean=(v:unknown,max=500)=>String(v||'').trim().slice(0,max);

async function resolveSession(env:Env,raw:string){if(!raw)return null;const hash=await sha256(raw);return env.DB.prepare(`SELECT s.id,s.tenant_id,s.conversation_id,s.customer_name FROM webchat_sessions s WHERE s.token_hash=? AND datetime(s.expires_at)>datetime('now') LIMIT 1`).bind(hash).first<{id:string;tenant_id:string;conversation_id:string;customer_name:string|null}>();}

export async function handleWebchat(request:Request,env:Env,url:URL):Promise<Response|null>{
  const start=url.pathname.match(/^\/api\/webchat\/([^/]+)\/session$/);
  if(start&&request.method==='POST'){
    const slug=decodeURIComponent(start[1]);let input:Record<string,unknown>={};try{input=await request.json() as Record<string,unknown>}catch{}
    const tenant=await env.DB.prepare(`SELECT t.id,t.name,s.public_name,s.primary_color,s.secondary_color,s.access_headline,s.access_message,s.access_show_brand,s.logo_key FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id=t.id WHERE t.slug=? AND t.status IN ('trial','active') LIMIT 1`).bind(slug).first<any>();
    if(!tenant)return json({error:'Empresa indisponível.'},404);const name=clean(input.name,120)||'Visitante';const conversationId=makeId('conv'),sessionId=makeId('wcs');const raw=`${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-','');const hash=await sha256(raw);const expires=new Date(Date.now()+WEBCHAT_TTL_DAYS*86400_000).toISOString();
    await env.DB.batch([env.DB.prepare(`INSERT INTO conversations (id,tenant_id,channel,customer_name,status,mode,last_message_at) VALUES (?,?,'webchat',?,'open','ai',datetime('now'))`).bind(conversationId,tenant.id,name),env.DB.prepare(`INSERT INTO webchat_sessions (id,tenant_id,conversation_id,token_hash,customer_name,expires_at) VALUES (?,?,?,?,?,?)`).bind(sessionId,tenant.id,conversationId,hash,name,expires)]);
    return json({data:{token:raw,conversation_id:conversationId,brand:{name:tenant.public_name||tenant.name,primary_color:tenant.primary_color||'#169CFF',secondary_color:tenant.secondary_color||'#0B2B7C',headline:tenant.access_headline||'Como podemos ajudar?',message:tenant.access_message||'Fale com nosso atendimento inteligente.',show_powered_by:Number(tenant.access_show_brand??1)!==0,logo_url:tenant.logo_key?`/webchat-brand/${encodeURIComponent(slug)}/logo`:null}}},201);
  }
  const messages=url.pathname.match(/^\/api\/webchat\/session\/([^/]+)\/messages$/);
  if(messages){const raw=decodeURIComponent(messages[1]);const session=await resolveSession(env,raw);if(!session)return json({error:'Sessão inválida ou expirada.'},401);await env.DB.prepare(`UPDATE webchat_sessions SET last_seen_at=datetime('now') WHERE id=?`).bind(session.id).run();
    if(request.method==='GET'){const rows=await env.DB.prepare(`SELECT id,direction,sender_type,message_type,text_content,created_at FROM conversation_messages WHERE tenant_id=? AND conversation_id=? ORDER BY datetime(created_at) ASC LIMIT 300`).bind(session.tenant_id,session.conversation_id).all();return json({data:rows.results||[]});}
    if(request.method==='POST'){let input:Record<string,unknown>={};try{input=await request.json() as Record<string,unknown>}catch{}const text=clean(input.text,4000);if(!text)return json({error:'Mensagem vazia.'},400);const id=makeId('msg');await env.DB.batch([env.DB.prepare(`INSERT INTO conversation_messages (id,tenant_id,conversation_id,direction,sender_type,message_type,text_content,metadata_json) VALUES (?,?,?,'inbound','customer','text',?,'{"provider":"webchat"}')`).bind(id,session.tenant_id,session.conversation_id,text),env.DB.prepare(`UPDATE conversations SET status='open',last_message_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(session.conversation_id,session.tenant_id),env.DB.prepare(`INSERT INTO conversation_events (id,tenant_id,conversation_id,event_type,actor_type,payload_json) VALUES (?,?,?,'message.received','webchat','{}')`).bind(makeId('cevt'),session.tenant_id,session.conversation_id)]);return json({data:{id}},201);}
    return json({error:'Método não permitido.'},405);
  }
  const logo=url.pathname.match(/^\/webchat-brand\/([^/]+)\/logo$/);if(logo&&request.method==='GET'){const slug=decodeURIComponent(logo[1]);const row=await env.DB.prepare(`SELECT s.logo_key FROM tenants t JOIN tenant_settings s ON s.tenant_id=t.id WHERE t.slug=? AND t.status IN ('trial','active') LIMIT 1`).bind(slug).first<{logo_key:string|null}>();if(!row?.logo_key)return json({error:'Logo indisponível.'},404);const object=await env.FILES.get(row.logo_key);if(!object)return json({error:'Arquivo indisponível.'},404);const headers=new Headers();object.writeHttpMetadata(headers);headers.set('cache-control','public, max-age=3600');headers.set('x-content-type-options','nosniff');return new Response(object.body,{headers});}
  return null;
}
