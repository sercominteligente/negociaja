import stable from './hml-stable';

type Env = Parameters<typeof stable.fetch>[1];

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const SAFE=new Set(['GET','HEAD','OPTIONS']);
const machineRoute=(path:string)=>path.startsWith('/api/integrations/outbox/')||path.startsWith('/api/webhooks/')||path.startsWith('/api/gateway/');

function validOrigin(request:Request){
  const origin=request.headers.get('origin');
  if(!origin)return false;
  try{return new URL(origin).origin===new URL(request.url).origin}catch{return false}
}

export default{async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  const method=request.method.toUpperCase();
  if(url.pathname.startsWith('/api/')&&!SAFE.has(method)&&!machineRoute(url.pathname)&&!validOrigin(request)){
    return json({error:'Origem não autorizada.',code:'invalid_origin'},403);
  }
  return stable.fetch(request,env);
}};
