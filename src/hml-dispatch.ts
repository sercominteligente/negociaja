import stable from './hml-stable';
import core from './hml-dispatch-core';

type Env = Parameters<typeof stable.fetch>[1];
const SAFE=new Set(['GET','HEAD','OPTIONS']);
const machineRoute=(path:string)=>path.startsWith('/api/integrations/outbox/')||path.startsWith('/api/webhooks/')||path.startsWith('/api/gateway/');
const stableMutation=(path:string)=>/^\/api\/catalog\/[^/]+\/image$/.test(path)||path.startsWith('/api/platform/')||path.startsWith('/api/ops/integration-health');
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
function validOrigin(request:Request){const origin=request.headers.get('origin');if(!origin)return false;try{return new URL(origin).origin===new URL(request.url).origin}catch{return false}}

export default{async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url),method=request.method.toUpperCase(),safe=SAFE.has(method);if(url.pathname.startsWith('/api/')&&!safe&&!machineRoute(url.pathname)&&!validOrigin(request))return json({error:'Origem não autorizada.',code:'invalid_origin'},403);if(!safe&&!stableMutation(url.pathname))return core.fetch(request,env);return stable.fetch(request,env)}};
