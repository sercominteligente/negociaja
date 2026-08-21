/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,authenticate,json} from './lib';

export async function handleOperations(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(url.pathname!=='/api/platform/operations')return null;
  const actor=await authenticate(request,env);if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  if(actor.actorType!=='platform_user'||actor.role!=='super_admin')return json({error:'Acesso exclusivo do Super Admin.'},403);
  if(request.method!=='GET')return json({error:'Método não permitido.'},405);
  const [jobs,events,channels,subscriptions]=await Promise.all([
    env.DB.prepare(`SELECT status,COUNT(*) total,MAX(updated_at) last_update FROM agent_async_jobs GROUP BY status ORDER BY total DESC`).all(),
    env.DB.prepare(`SELECT processed,COUNT(*) total,MAX(created_at) last_event FROM payment_events GROUP BY processed`).all(),
    env.DB.prepare(`SELECT channel_type,status,COUNT(*) total FROM channels GROUP BY channel_type,status ORDER BY channel_type,status`).all(),
    env.DB.prepare(`SELECT status,COUNT(*) total FROM tenant_subscriptions GROUP BY status ORDER BY status`).all()
  ]);
  const recentFailures=await env.DB.prepare(`SELECT id,tenant_id,conversation_id,status,attempts,last_error,updated_at FROM agent_async_jobs WHERE status IN ('retry','enqueue_failed') ORDER BY updated_at DESC LIMIT 30`).all();
  const paymentFailures=await env.DB.prepare(`SELECT id,event_type,tenant_id,error,created_at FROM payment_events WHERE processed=0 AND error IS NOT NULL ORDER BY created_at DESC LIMIT 30`).all();
  return json({data:{queue_binding_ready:Boolean(env.AGENT_QUEUE),mercadopago_ready:Boolean(env.MERCADOPAGO_ACCESS_TOKEN&&env.MERCADOPAGO_WEBHOOK_SECRET),jobs:jobs.results||[],recent_job_failures:recentFailures.results||[],payment_events:events.results||[],recent_payment_failures:paymentFailures.results||[],channels:channels.results||[],subscriptions:subscriptions.results||[]}});
}
