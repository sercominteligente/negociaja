import stable from './hml-stable';
import core from './hml-dispatch-core';

type Env = Parameters<typeof stable.fetch>[1];
const SAFE=new Set(['GET','HEAD','OPTIONS']);
const machineRoute=(path:string)=>path.startsWith('/api/integrations/outbox/')||path.startsWith('/api/webhooks/')||path.startsWith('/api/gateway/');
const stableMutation=(path:string)=>/^\/api\/catalog\/[^/]+\/image$/.test(path)||path.startsWith('/api/platform/')||path.startsWith('/api/ops/integration-health')||path.startsWith('/api/privacy');
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
function validOrigin(request:Request){const origin=request.headers.get('origin');if(!origin)return false;try{return new URL(origin).origin===new URL(request.url).origin}catch{return false}}

const BRAND_CSS=`
<style id="negociaja-official-brand">
.brand-word,.admin-brand,.admin-mobile-brand,.sa-brand{font-size:0!important;color:transparent!important;background-image:url('/brand/logo-primary.png')!important;background-repeat:no-repeat!important;background-position:left center!important;background-size:contain!important;text-decoration:none!important;overflow:hidden!important}
.brand-word{display:block!important;width:190px!important;height:62px!important;flex:0 0 190px!important}
.admin-brand{display:block!important;width:172px!important;height:62px!important;margin:4px 10px 18px!important}
.admin-mobile-brand{display:block!important;width:132px!important;height:42px!important;flex:0 0 132px!important}
.sa-brand{display:block!important;width:176px!important;height:68px!important;margin:4px 10px 18px!important}
.sa-brand small{display:none!important}
.landing .hero-copy p::before{content:"";display:block;width:min(520px,100%);aspect-ratio:3/1;background:url('/brand/logo-primary.png') left center/contain no-repeat;margin:2px 0 22px}
@media(max-width:760px){.brand-word{width:148px!important;height:48px!important;flex-basis:148px!important}.landing .hero-copy p::before{width:min(440px,100%);margin:0 0 16px}.admin-brand{width:168px!important;height:60px!important}.sa-brand{width:168px!important;height:64px!important}}
</style>`;

async function decorateHtml(response:Response){const type=response.headers.get('content-type')||'';if(!response.ok||!type.includes('text/html'))return response;const html=await response.text();const decorated=html.includes('negociaja-official-brand')?html:html.replace('</head>',`${BRAND_CSS}</head>`);const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');return new Response(decorated,{status:response.status,statusText:response.statusText,headers})}

async function serveCanonicalLogo(request:Request,env:Env){const target=new URL(request.url);target.pathname='/brand/logo-primary.png';const forwarded=new Request(target.toString(),request);const response=await stable.fetch(forwarded,env);if(!response.ok)return response;const headers=new Headers(response.headers);headers.set('content-type','image/png');headers.set('cache-control','public, max-age=3600');headers.delete('content-length');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}

export default{async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url),method=request.method.toUpperCase(),safe=SAFE.has(method);if(safe&&url.pathname==='/brand/logo-primary.webp')return serveCanonicalLogo(request,env);if(url.pathname.startsWith('/api/')&&!safe&&!machineRoute(url.pathname)&&!validOrigin(request))return json({error:'Origem não autorizada.',code:'invalid_origin'},403);let response:Response;if(!safe&&!stableMutation(url.pathname))response=await core.fetch(request,env);else response=await stable.fetch(request,env);if(safe&&!url.pathname.startsWith('/api/'))return decorateHtml(response);return response}};