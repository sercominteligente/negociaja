/* NegocIAJá! — SER Comunicação */
import {Env,authenticate,json,resolveTenant} from './lib';

export async function handleConversationMedia(request:Request,env:Env,url:URL):Promise<Response|null>{
  const match=url.pathname.match(/^\/api\/conversation-media\/([^/]+)$/);if(!match)return null;
  if(request.method!=='GET')return json({error:'Método não permitido.'},405);
  const actor=await authenticate(request,env);if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  const tenantId=await resolveTenant(request,env,actor);if(!tenantId)return json({error:'Selecione uma empresa para operar.'},409);
  const messageId=decodeURIComponent(match[1]);
  const row=await env.DB.prepare(`SELECT media_key,message_type,metadata_json FROM conversation_messages WHERE id=? AND tenant_id=? LIMIT 1`).bind(messageId,tenantId).first<{media_key:string|null;message_type:string;metadata_json:string}>();
  if(!row?.media_key)return json({error:'Mídia não encontrada.'},404);
  const object=await env.FILES.get(row.media_key);if(!object)return json({error:'Arquivo não encontrado no storage.'},404);
  let mime='application/octet-stream';try{const meta=JSON.parse(row.metadata_json||'{}');mime=String(meta.mime||mime);}catch{}
  const headers=new Headers({'content-type':object.httpMetadata?.contentType||mime,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'"});
  const size=object.size;if(Number.isFinite(size))headers.set('content-length',String(size));
  return new Response(object.body,{status:200,headers});
}
