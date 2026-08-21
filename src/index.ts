/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {handleApi} from './api';
import {handleOnboarding} from './onboarding';
import {handleBranding} from './branding';
import {handleTeam} from './team';
import {handlePlatform} from './platform';
import {handleConversations} from './conversations';
import {handleEvolution} from './evolution';
import {handleConversationMedia} from './conversation-media';
import {handleMultimodal} from './multimodal';
import {handleWebchat} from './webchat';
import {handleAgentTools} from './agent-tools';
import {handleAgentRuntime} from './agent-runtime';
import {consumeAgentQueue,AgentQueueJob} from './agent-queue';
import {authenticate,Env,json} from './lib';

export default {
async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);try{
  const webchatResponse=await handleWebchat(request,env,url);if(webchatResponse)return webchatResponse;
  const evolutionResponse=await handleEvolution(request,env,url);if(evolutionResponse)return evolutionResponse;
  const multimodalResponse=await handleMultimodal(request,env,url);if(multimodalResponse)return multimodalResponse;
  const mediaResponse=await handleConversationMedia(request,env,url);if(mediaResponse)return mediaResponse;
  const agentRuntimeResponse=await handleAgentRuntime(request,env,url);if(agentRuntimeResponse)return agentRuntimeResponse;
  const agentToolsResponse=await handleAgentTools(request,env,url);if(agentToolsResponse)return agentToolsResponse;
  const conversationResponse=await handleConversations(request,env,url);if(conversationResponse)return conversationResponse;
  const platformResponse=await handlePlatform(request,env,url);if(platformResponse)return platformResponse;
  const teamResponse=await handleTeam(request,env,url);if(teamResponse)return teamResponse;
  const brandingResponse=await handleBranding(request,env,url);if(brandingResponse)return brandingResponse;
  const onboardingResponse=await handleOnboarding(request,env,url);if(onboardingResponse)return onboardingResponse;
  const apiResponse=await handleApi(request,env,url);if(apiResponse)return apiResponse;
  const chatMatch=url.pathname.match(/^\/chat\/([^/]+)\/?$/);if(chatMatch)return env.ASSETS.fetch(new Request(new URL(`/webchat.html?tenant=${encodeURIComponent(chatMatch[1])}`,url.origin),request));
  if(url.pathname==='/login'||url.pathname==='/login/'){const actor=await authenticate(request,env);if(actor)return Response.redirect(new URL(actor.role==='super_admin'?'/super-admin':'/app',url.origin).toString(),302);return env.ASSETS.fetch(new Request(new URL('/login.html',url.origin),request));}
  if(url.pathname==='/cadastro'||url.pathname==='/cadastro/')return env.ASSETS.fetch(new Request(new URL('/signup.html',url.origin),request));
  if(url.pathname==='/confirmar-email'||url.pathname==='/confirmar-email/')return env.ASSETS.fetch(new Request(new URL('/verify-email.html',url.origin),request));
  if(url.pathname==='/aceitar-convite'||url.pathname==='/aceitar-convite/')return env.ASSETS.fetch(new Request(new URL('/accept-invite.html',url.origin),request));
  if(url.pathname==='/super-admin'||url.pathname==='/super-admin/'){const actor=await authenticate(request,env);if(!actor)return Response.redirect(new URL('/login',url.origin).toString(),302);if(actor.role!=='super_admin')return Response.redirect(new URL('/app',url.origin).toString(),302);return env.ASSETS.fetch(new Request(new URL('/super-admin.html',url.origin),request));}
  if(url.pathname==='/onboarding'||url.pathname==='/onboarding/'){const actor=await authenticate(request,env);if(!actor)return Response.redirect(new URL('/login',url.origin).toString(),302);if(actor.role==='super_admin')return Response.redirect(new URL('/super-admin',url.origin).toString(),302);return env.ASSETS.fetch(new Request(new URL('/onboarding.html',url.origin),request));}
  if(url.pathname==='/equipe'||url.pathname==='/equipe/'){const actor=await authenticate(request,env);if(!actor)return Response.redirect(new URL('/login',url.origin).toString(),302);if(actor.role!=='admin')return Response.redirect(new URL('/app',url.origin).toString(),302);return env.ASSETS.fetch(new Request(new URL('/team.html',url.origin),request));}
  if(url.pathname==='/canal-whatsapp'||url.pathname==='/canal-whatsapp/'){const actor=await authenticate(request,env);if(!actor)return Response.redirect(new URL('/login',url.origin).toString(),302);if(actor.role!=='admin'&&actor.role!=='super_admin')return Response.redirect(new URL('/app',url.origin).toString(),302);if(actor.role==='super_admin'&&!actor.tenantId)return Response.redirect(new URL('/super-admin',url.origin).toString(),302);return env.ASSETS.fetch(new Request(new URL('/channel-whatsapp.html',url.origin),request));}
  if(url.pathname==='/acoes-ia'||url.pathname==='/acoes-ia/'){const actor=await authenticate(request,env);if(!actor)return Response.redirect(new URL('/login',url.origin).toString(),302);if(actor.role==='super_admin'&&!actor.tenantId)return Response.redirect(new URL('/super-admin',url.origin).toString(),302);return env.ASSETS.fetch(new Request(new URL('/agent-actions.html',url.origin),request));}
  if(url.pathname==='/inbox'||url.pathname==='/inbox/'){const actor=await authenticate(request,env);if(!actor)return Response.redirect(new URL('/login',url.origin).toString(),302);if(actor.role==='super_admin'&&!actor.tenantId)return Response.redirect(new URL('/super-admin',url.origin).toString(),302);return env.ASSETS.fetch(new Request(new URL('/inbox.html',url.origin),request));}
  if(url.pathname==='/app'||url.pathname==='/app/'){const actor=await authenticate(request,env);if(!actor)return Response.redirect(new URL('/login',url.origin).toString(),302);if(actor.role==='super_admin'&&!actor.tenantId)return Response.redirect(new URL('/super-admin',url.origin).toString(),302);return env.ASSETS.fetch(new Request(new URL('/app.html',url.origin),request));}
  return env.ASSETS.fetch(request);
}catch(error){console.error('NegocIAJá error',error);return url.pathname.startsWith('/api/')||url.pathname.startsWith('/webhooks/')?json({error:'Erro interno.',requestId:crypto.randomUUID()},500):new Response('NegocIAJá temporariamente indisponível.',{status:500});}},
async queue(batch:MessageBatch<AgentQueueJob>,env:Env):Promise<void>{await consumeAgentQueue(batch,env);}
};
