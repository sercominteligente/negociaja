/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,makeId} from './lib';
import {runConversationAgent} from './agent-runtime';
import {preprocessInboundMessage} from './multimodal';

export type AgentQueueJob={job_id:string;tenant_id:string;conversation_id:string;input_message_id:string};

export async function enqueueAgentResponse(env:Env,tenantId:string,conversationId:string,inputMessageId:string){
  if(!env.AGENT_QUEUE)return{queued:false,reason:'queue_binding_absent'};
  const existing=await env.DB.prepare(`SELECT id,status FROM agent_async_jobs WHERE input_message_id=? LIMIT 1`).bind(inputMessageId).first<{id:string;status:string}>();
  if(existing)return{queued:true,duplicate:true,job_id:existing.id,status:existing.status};
  const jobId=makeId('ajob');
  try{
    await env.DB.prepare(`INSERT INTO agent_async_jobs (id,tenant_id,conversation_id,input_message_id,status) VALUES (?,?,?,?,'pending')`).bind(jobId,tenantId,conversationId,inputMessageId).run();
  }catch(error){
    // Corrida entre dois produtores: a UNIQUE(input_message_id) é a autoridade.
    const raced=await env.DB.prepare(`SELECT id,status FROM agent_async_jobs WHERE input_message_id=? LIMIT 1`).bind(inputMessageId).first<{id:string;status:string}>();
    if(raced)return{queued:true,duplicate:true,job_id:raced.id,status:raced.status};
    throw error;
  }
  try{
    await env.AGENT_QUEUE.send({job_id:jobId,tenant_id:tenantId,conversation_id:conversationId,input_message_id:inputMessageId});
    return{queued:true,job_id:jobId};
  }catch(error){
    const msg=error instanceof Error?error.message:String(error);
    await env.DB.prepare(`UPDATE agent_async_jobs SET status='enqueue_failed',last_error=?,updated_at=datetime('now') WHERE id=?`).bind(msg,jobId).run();
    throw error;
  }
}

export async function consumeAgentQueue(batch:MessageBatch<AgentQueueJob>,env:Env){
  for(const message of batch.messages){
    const job=message.body;
    try{
      const receipt=await env.DB.prepare(`SELECT status,attempts,updated_at FROM agent_async_jobs WHERE id=? AND tenant_id=? AND input_message_id=? LIMIT 1`).bind(job.job_id,job.tenant_id,job.input_message_id).first<{status:string;attempts:number;updated_at:string}>();
      if(!receipt||receipt.status==='completed'||receipt.status==='skipped'){message.ack();continue;}

      // Reivindica jobs normais ou um `processing` abandonado por execução interrompida.
      const claimed=await env.DB.prepare(`UPDATE agent_async_jobs SET status='processing',attempts=attempts+1,started_at=COALESCE(started_at,datetime('now')),updated_at=datetime('now') WHERE id=? AND tenant_id=? AND (status IN ('pending','retry','enqueue_failed') OR (status='processing' AND datetime(updated_at)<=datetime('now','-5 minutes')))`).bind(job.job_id,job.tenant_id).run();
      if(!claimed.meta.changes){message.retry();continue;}

      const conv=await env.DB.prepare(`SELECT status,mode FROM conversations WHERE id=? AND tenant_id=? LIMIT 1`).bind(job.conversation_id,job.tenant_id).first<{status:string;mode:string}>();
      if(!conv||conv.status!=='open'||conv.mode!=='ai'){
        await env.DB.prepare(`UPDATE agent_async_jobs SET status='skipped',last_error=?,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).bind(!conv?'conversation_not_found':`conversation_${conv.status}_${conv.mode}`,job.job_id).run();
        message.ack();continue;
      }

      const already=await env.DB.prepare(`SELECT id FROM agent_runs WHERE tenant_id=? AND conversation_id=? AND input_message_id=? AND status='completed' LIMIT 1`).bind(job.tenant_id,job.conversation_id,job.input_message_id).first();
      if(already){
        await env.DB.prepare(`UPDATE agent_async_jobs SET status='completed',completed_at=datetime('now'),last_error=NULL,updated_at=datetime('now') WHERE id=?`).bind(job.job_id).run();
        message.ack();continue;
      }

      await preprocessInboundMessage(env,job.tenant_id,job.input_message_id);
      await runConversationAgent(env,job.tenant_id,job.conversation_id,job.input_message_id);
      await env.DB.prepare(`UPDATE agent_async_jobs SET status='completed',last_error=NULL,completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).bind(job.job_id).run();
      message.ack();
    }catch(error){
      const msg=error instanceof Error?error.message:String(error);
      await env.DB.prepare(`UPDATE agent_async_jobs SET status='retry',last_error=?,updated_at=datetime('now') WHERE id=?`).bind(msg.slice(0,1500),job.job_id).run();
      message.retry();
    }
  }
}
