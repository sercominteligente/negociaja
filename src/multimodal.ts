/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,authenticate,bytesToBase64,json,resolveTenant} from './lib';

function extractOutputText(payload:any){if(typeof payload?.output_text==='string')return payload.output_text;for(const item of payload?.output||[])for(const part of item?.content||[])if(typeof part?.text==='string')return part.text;return '';}

export async function handleMultimodal(request:Request,env:Env,url:URL):Promise<Response|null>{
  const match=url.pathname.match(/^\/api\/messages\/([^/]+)\/(transcribe|analyze-image)$/);if(!match)return null;
  if(request.method!=='POST')return json({error:'Método não permitido.'},405);
  const actor=await authenticate(request,env);if(!actor)return json({error:'Sessão ausente ou expirada.'},401);const tenantId=await resolveTenant(request,env,actor);if(!tenantId)return json({error:'Selecione uma empresa para operar.'},409);if(!env.OPENAI_API_KEY)return json({error:'OPENAI_API_KEY não configurada neste ambiente.'},503);
  const messageId=decodeURIComponent(match[1]),action=match[2];const row=await env.DB.prepare(`SELECT id,message_type,media_key,metadata_json FROM conversation_messages WHERE id=? AND tenant_id=? LIMIT 1`).bind(messageId,tenantId).first<{id:string;message_type:string;media_key:string|null;metadata_json:string}>();if(!row?.media_key)return json({error:'Mensagem não possui mídia processável.'},404);const object=await env.FILES.get(row.media_key);if(!object)return json({error:'Mídia não encontrada no R2.'},404);
  const bytes=new Uint8Array(await object.arrayBuffer());const mime=object.httpMetadata?.contentType||'application/octet-stream';
  if(action==='transcribe'){
    if(row.message_type!=='audio')return json({error:'A mensagem não é áudio.'},400);const form=new FormData();form.append('model',env.OPENAI_TRANSCRIBE_MODEL||'gpt-transcribe');form.append('file',new File([bytes],`audio-${messageId}`,{type:mime}));const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`},body:form});const data=await r.json() as any;if(!r.ok)return json({error:'Falha na transcrição.',provider_error:data?.error?.message||null},502);const transcript=String(data.text||'').trim();let meta:any={};try{meta=JSON.parse(row.metadata_json||'{}')}catch{}meta.transcript=transcript;meta.transcription_model=env.OPENAI_TRANSCRIBE_MODEL||'gpt-transcribe';await env.DB.prepare(`UPDATE conversation_messages SET text_content=COALESCE(NULLIF(text_content,''),?),metadata_json=? WHERE id=? AND tenant_id=?`).bind(transcript,JSON.stringify(meta),messageId,tenantId).run();return json({data:{transcript}});
  }
  if(row.message_type!=='image')return json({error:'A mensagem não é imagem.'},400);const dataUrl=`data:${mime};base64,${bytesToBase64(bytes)}`;const payload={model:env.OPENAI_VISION_MODEL||'gpt-5.6-luna',input:[{role:'user',content:[{type:'input_text',text:'Analise esta imagem enviada por um cliente em contexto comercial. Descreva objetivamente o que aparece, identifique textos visíveis, produtos/itens relevantes e sinais úteis para atendimento ou venda. Não invente detalhes.'},{type:'input_image',image_url:dataUrl}]}]};const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(payload)});const data=await r.json() as any;if(!r.ok)return json({error:'Falha na análise da imagem.',provider_error:data?.error?.message||null},502);const analysis=extractOutputText(data).trim();let meta:any={};try{meta=JSON.parse(row.metadata_json||'{}')}catch{}meta.image_analysis=analysis;meta.vision_model=env.OPENAI_VISION_MODEL||'gpt-5.6-luna';await env.DB.prepare(`UPDATE conversation_messages SET metadata_json=? WHERE id=? AND tenant_id=?`).bind(JSON.stringify(meta),messageId,tenantId).run();return json({data:{analysis}});
}
