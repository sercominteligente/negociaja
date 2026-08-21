/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,audit,authenticate,body,json,makeId,resolveTenant} from './lib';

export async function handleConversations(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(!url.pathname.startsWith('/api/conversations'))return null;
  const actor=await authenticate(request,env);if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  const tenantId=await resolveTenant(request,env,actor);if(!tenantId)return json({error:'Selecione uma empresa para operar.'},409);
  const method=request.method.toUpperCase();
  if(method==='GET'&&url.pathname==='/api/conversations'){
    const status=url.searchParams.get('status')||'open';const rows=await env.DB.prepare(`SELECT id,channel,customer_name,customer_address,status,mode,assigned_user_id,last_message_at,created_at FROM conversations WHERE tenant_id=? AND status=? ORDER BY datetime(last_message_at) DESC LIMIT 100`).bind(tenantId,status).all();return json({data:rows.results||[]});
  }
  if(method==='POST'&&url.pathname==='/api/conversations'){
    const input=await body(request);const channel=String(input.channel||'webchat').trim();const name=String(input.customer_name||'').trim().slice(0,120);const address=String(input.customer_address||'').trim().slice(0,200);if(!['webchat','whatsapp','telegram','internal'].includes(channel))return json({error:'Canal inválido.'},400);const id=makeId('conv');await env.DB.prepare(`INSERT INTO conversations (id,tenant_id,channel,customer_name,customer_address,status,mode) VALUES (?,?,?,?,?,'open','ai')`).bind(id,tenantId,channel,name||null,address||null).run();await audit(env,actor,tenantId,'conversation.created','conversation',id,{channel});return json({data:{id}},201);
  }
  const match=url.pathname.match(/^\/api\/conversations\/([^/]+)(?:\/(messages|takeover|release|close))?$/);if(!match)return json({error:'Endpoint não encontrado.'},404);const conversationId=match[1],action=match[2]||'';const conv=await env.DB.prepare('SELECT id,status,mode,assigned_user_id FROM conversations WHERE id=? AND tenant_id=?').bind(conversationId,tenantId).first<{id:string;status:string;mode:string;assigned_user_id:string|null}>();if(!conv)return json({error:'Conversa não encontrada.'},404);
  if(method==='GET'&&!action){const messages=await env.DB.prepare(`SELECT id,direction,sender_type,sender_id,message_type,text_content,media_key,metadata_json,created_at FROM conversation_messages WHERE tenant_id=? AND conversation_id=? ORDER BY datetime(created_at) ASC LIMIT 500`).bind(tenantId,conversationId).all();return json({data:{conversation:conv,messages:messages.results||[]}});}
  if(method==='POST'&&action==='messages'){
    const input=await body(request);const text=String(input.text||'').trim().slice(0,8000);if(!text)return json({error:'Mensagem vazia.'},400);if(conv.status==='closed')return json({error:'Conversa encerrada.'},409);const id=makeId('msg');await env.DB.batch([env.DB.prepare(`INSERT INTO conversation_messages (id,tenant_id,conversation_id,direction,sender_type,sender_id,message_type,text_content) VALUES (?,?,?,'outbound','human',?,'text',?)`).bind(id,tenantId,conversationId,actor.actorId,text),env.DB.prepare(`UPDATE conversations SET mode='human',assigned_user_id=?,last_message_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(actor.actorId,conversationId,tenantId),env.DB.prepare(`INSERT INTO conversation_events (id,tenant_id,conversation_id,event_type,actor_type,actor_id,payload_json) VALUES (?,?,?,'message.sent','user',?,'{}')`).bind(makeId('cevt'),tenantId,conversationId,actor.actorId)]);return json({data:{id,mode:'human'}},201);
  }
  if(method==='POST'&&action==='takeover'){if(conv.status==='closed')return json({error:'Conversa encerrada.'},409);await env.DB.batch([env.DB.prepare(`UPDATE conversations SET mode='human',assigned_user_id=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(actor.actorId,conversationId,tenantId),env.DB.prepare(`INSERT INTO conversation_events (id,tenant_id,conversation_id,event_type,actor_type,actor_id,payload_json) VALUES (?,?,?,'takeover.started','user',?,'{}')`).bind(makeId('cevt'),tenantId,conversationId,actor.actorId)]);await audit(env,actor,tenantId,'conversation.takeover','conversation',conversationId);return json({data:{ok:true,mode:'human',assigned_user_id:actor.actorId}});}
  if(method==='POST'&&action==='release'){await env.DB.batch([env.DB.prepare(`UPDATE conversations SET mode='ai',assigned_user_id=NULL,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(conversationId,tenantId),env.DB.prepare(`INSERT INTO conversation_events (id,tenant_id,conversation_id,event_type,actor_type,actor_id,payload_json) VALUES (?,?,?,'takeover.released','user',?,'{}')`).bind(makeId('cevt'),tenantId,conversationId,actor.actorId)]);await audit(env,actor,tenantId,'conversation.release','conversation',conversationId);return json({data:{ok:true,mode:'ai'}});}
  if(method==='POST'&&action==='close'){await env.DB.prepare(`UPDATE conversations SET status='closed',updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(conversationId,tenantId).run();await audit(env,actor,tenantId,'conversation.closed','conversation',conversationId);return json({data:{ok:true,status:'closed'}});}
  return json({error:'Método não permitido.'},405);
}
