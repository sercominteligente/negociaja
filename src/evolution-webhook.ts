/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,json,makeId,sha256} from './lib';
import {enqueueAgentResponse} from './agent-queue';

const MAX_MEDIA_BYTES=10*1024*1024;
const clean=(value:unknown,max=500)=>String(value??'').trim().slice(0,max);
const normalizeEvent=(value:unknown)=>clean(value,80).replace(/[.\-\s]+/g,'_').toUpperCase();
const decodeBase64=(value:string)=>Uint8Array.from(atob(value.replace(/^data:[^,]+,/,'')),c=>c.charCodeAt(0));

export async function handleEvolutionInbound(request:Request,env:Env,url:URL):Promise<Response|null>{
  const route=url.pathname.match(/^\/webhooks\/evolution\/([^/]+)$/);
  if(!route)return null;
  if(request.method!=='POST')return json({error:'Método não permitido.'},405);

  const instance=decodeURIComponent(route[1]);
  const supplied=request.headers.get('x-negociaja-webhook-token')||'';
  if(!supplied)return json({error:'Webhook não autorizado.'},401);
  const suppliedHash=await sha256(supplied);
  const connection=await env.DB.prepare(`SELECT id,tenant_id,instance_name,status FROM channel_connections WHERE provider='evolution' AND instance_name=? AND webhook_token_hash=? AND status='active' LIMIT 1`).bind(instance,suppliedHash).first<{id:string;tenant_id:string;instance_name:string;status:string}>();
  if(!connection)return json({error:'Webhook não autorizado.'},401);

  let payload:Record<string,any>;
  try{payload=await request.json() as Record<string,any>;}catch{return json({error:'JSON inválido.'},400);}
  const event=normalizeEvent(payload.event||payload.type);
  if(event==='CONNECTION_UPDATE')return json({data:{ok:true,event}});
  if(event&&event!=='MESSAGES_UPSERT'&&event!=='MESSAGES_UPDATE')return json({data:{ignored:true,event}});

  const data=payload.data||payload;
  const key=data.key||{};
  if(key.fromMe===true)return json({data:{ignored:true,reason:'outbound_echo'}});
  const remoteJid=clean(key.remoteJid||data.remoteJid||data.sender||payload.sender,220);
  const externalId=clean(key.id||data.id||data.messageId,220);
  if(!remoteJid)return json({error:'Remetente não identificado.'},400);

  if(externalId){
    const existing=await env.DB.prepare(`SELECT id FROM conversation_messages WHERE tenant_id=? AND external_message_id=? LIMIT 1`).bind(connection.tenant_id,externalId).first<{id:string}>();
    if(existing)return json({data:{ok:true,duplicate:true,message_id:existing.id}});
  }

  const msg=data.message||{};
  let type='text',mime='',mediaBase64='';
  if(msg.audioMessage){type='audio';mime=clean(msg.audioMessage.mimetype,120);mediaBase64=clean(msg.audioMessage.base64||'',20_000_000);}
  else if(msg.imageMessage){type='image';mime=clean(msg.imageMessage.mimetype,120);mediaBase64=clean(msg.imageMessage.base64||'',20_000_000);}
  else if(msg.videoMessage){type='video';mime=clean(msg.videoMessage.mimetype,120);mediaBase64=clean(msg.videoMessage.base64||'',20_000_000);}
  else if(msg.documentMessage){type='document';mime=clean(msg.documentMessage.mimetype,120);mediaBase64=clean(msg.documentMessage.base64||'',20_000_000);}
  mediaBase64=mediaBase64||clean(data.base64||payload.base64||msg.base64||'',20_000_000);
  const text=clean(msg.conversation||msg.extendedTextMessage?.text||msg.imageMessage?.caption||msg.videoMessage?.caption||data.body||'',8000);
  const customerName=clean(data.pushName||payload.senderName||remoteJid.split('@')[0],120);

  let conversation=await env.DB.prepare(`SELECT id FROM conversations WHERE tenant_id=? AND channel='whatsapp' AND external_thread_id=? LIMIT 1`).bind(connection.tenant_id,remoteJid).first<{id:string}>();
  const conversationId=conversation?.id||makeId('conv');
  if(!conversation){
    await env.DB.prepare(`INSERT INTO conversations (id,tenant_id,channel,external_thread_id,customer_name,customer_address,status,mode,last_message_at,updated_at) VALUES (?,?,'whatsapp',?,?,?,'open','ai',datetime('now'),datetime('now'))`).bind(conversationId,connection.tenant_id,remoteJid,customerName,remoteJid).run();
  }else{
    await env.DB.prepare(`UPDATE conversations SET customer_name=COALESCE(NULLIF(?,''),customer_name),status='open',last_message_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(customerName,conversationId,connection.tenant_id).run();
  }

  const messageId=makeId('msg');
  let mediaKey:string|null=null;
  if(mediaBase64&&type!=='text'){
    try{
      const bytes=decodeBase64(mediaBase64);
      if(bytes.byteLength>0&&bytes.byteLength<=MAX_MEDIA_BYTES){
        mediaKey=`tenants/${connection.tenant_id}/conversations/${conversationId}/${messageId}`;
        await env.FILES.put(mediaKey,bytes,{httpMetadata:{contentType:mime||'application/octet-stream',cacheControl:'private, max-age=3600'}});
      }
    }catch{/* mídia inválida não derruba o recebimento textual */}
  }

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO conversation_messages (id,tenant_id,conversation_id,direction,sender_type,message_type,text_content,media_key,external_message_id,metadata_json) VALUES (?,?,?,'inbound','customer',?,?,?,?,?)`).bind(messageId,connection.tenant_id,conversationId,type,text||null,mediaKey,externalId||null,JSON.stringify({provider:'evolution',instance,event,mime})),
    env.DB.prepare(`INSERT INTO conversation_events (id,tenant_id,conversation_id,event_type,actor_type,payload_json) VALUES (?,?,?,'message.received','provider',?)`).bind(makeId('cevt'),connection.tenant_id,conversationId,JSON.stringify({provider:'evolution',instance,external_message_id:externalId||null}))
  ]);

  let queue:{queued:boolean;[key:string]:unknown}={queued:false};
  try{queue=await enqueueAgentResponse(env,connection.tenant_id,conversationId,messageId);}catch(error){
    console.error(JSON.stringify({event:'agent_queue_enqueue_failed',tenant_id:connection.tenant_id,conversation_id:conversationId,message_id:messageId,error:error instanceof Error?error.message:String(error)}));
  }
  return json({data:{ok:true,conversation_id:conversationId,message_id:messageId,message_type:type,media_stored:Boolean(mediaKey),agent_queue:queue}});
}
