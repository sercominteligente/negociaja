/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env} from './lib';

function fallback(kind:'full'|'icon'){
  const svg=kind==='icon'
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="NegocIAJá!"><rect width="128" height="128" rx="30" fill="#0d47a1"/><circle cx="64" cy="64" r="42" fill="#00b2ff"/><path d="M34 70h52l10-28H48l-5-12H27" fill="none" stroke="#ffb300" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="53" cy="92" r="7" fill="#fff"/><circle cx="83" cy="92" r="7" fill="#fff"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 180" role="img" aria-label="NegocIAJá!"><rect width="780" height="180" fill="transparent"/><text x="20" y="122" font-family="Arial,Helvetica,sans-serif" font-size="116" font-weight="900" fill="#0d2b6f">Negoc</text><text x="340" y="122" font-family="Arial,Helvetica,sans-serif" font-size="116" font-weight="900" fill="#00b2ff">IA</text><text x="465" y="122" font-family="Arial,Helvetica,sans-serif" font-size="116" font-weight="900" fill="#ffb300">Já!</text></svg>`;
  return new Response(svg,{headers:{'content-type':'image/svg+xml; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}

export async function handlePublicBrand(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(request.method!=='GET')return null;
  const kind=url.pathname==='/api/public/marketing/asset/logo-full'?'full':url.pathname==='/api/public/marketing/asset/logo-icon'?'icon':null;
  if(!kind)return null;
  try{
    const field=kind==='full'?'logo_full_key':'logo_icon_key';
    const row=await env.DB.prepare(`SELECT ${field} asset_key FROM platform_marketing WHERE id='default' LIMIT 1`).first<{asset_key:string|null}>();
    if(row?.asset_key){
      try{
        const obj=await env.FILES.get(row.asset_key);
        if(obj){const headers=new Headers();obj.writeHttpMetadata(headers);headers.set('cache-control','public, max-age=3600');headers.set('x-content-type-options','nosniff');return new Response(obj.body,{headers});}
      }catch(error){console.warn(JSON.stringify({event:'brand_r2_fallback',kind,error:error instanceof Error?error.message:String(error)}));}
    }
  }catch(error){console.warn(JSON.stringify({event:'brand_db_fallback',kind,error:error instanceof Error?error.message:String(error)}));}
  return fallback(kind);
}
