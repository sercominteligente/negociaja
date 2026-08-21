/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,authenticate,json,audit} from './lib';

const IMAGE_TYPES=new Map([['image/png','png'],['image/jpeg','jpg'],['image/webp','webp']]);
const VIDEO_TYPES=new Map([['video/mp4','mp4'],['video/webm','webm']]);
const MAX_IMAGE=4*1024*1024,MAX_VIDEO=50*1024*1024;
const clean=(v:unknown,max:number)=>String(v??'').trim().slice(0,max);
async function asset(env:Env,key:string|null){if(!key)return null;const obj=await env.FILES.get(key);if(!obj)return null;const h=new Headers();obj.writeHttpMetadata(h);h.set('cache-control','public, max-age=3600');h.set('x-content-type-options','nosniff');return new Response(obj.body,{headers:h});}

export async function handleMarketing(request:Request,env:Env,url:URL):Promise<Response|null>{
  const method=request.method.toUpperCase();
  if(method==='GET'&&url.pathname==='/api/public/marketing'){
    const row=await env.DB.prepare(`SELECT hero_kicker,hero_title,hero_subtitle,video_title,video_description,logo_full_key,logo_icon_key,hero_video_key,hero_video_poster_key FROM platform_marketing WHERE id='default'`).first<Record<string,unknown>>();
    return json({data:{hero_kicker:row?.hero_kicker,hero_title:row?.hero_title,hero_subtitle:row?.hero_subtitle,video_title:row?.video_title,video_description:row?.video_description,logo_full_url:row?.logo_full_key?'/api/public/marketing/asset/logo-full':null,logo_icon_url:row?.logo_icon_key?'/api/public/marketing/asset/logo-icon':null,hero_video_url:row?.hero_video_key?'/api/public/marketing/asset/video':null,hero_video_poster_url:row?.hero_video_poster_key?'/api/public/marketing/asset/poster':null}});
  }
  if(method==='GET'&&url.pathname.startsWith('/api/public/marketing/asset/')){
    const kind=url.pathname.split('/').pop();const row=await env.DB.prepare(`SELECT logo_full_key,logo_icon_key,hero_video_key,hero_video_poster_key FROM platform_marketing WHERE id='default'`).first<Record<string,string|null>>();const key=kind==='logo-full'?row?.logo_full_key:kind==='logo-icon'?row?.logo_icon_key:kind==='video'?row?.hero_video_key:kind==='poster'?row?.hero_video_poster_key:null;return await asset(env,key||null)||json({error:'Arquivo não encontrado.'},404);
  }
  if(method==='GET'&&url.pathname==='/api/public/login-brand'){
    const slug=clean(url.searchParams.get('tenant'),80);if(!slug)return json({data:null});const row=await env.DB.prepare(`SELECT t.name,s.public_name,s.primary_color,s.secondary_color,s.logo_key,s.login_background_key,s.login_headline,s.login_message,s.login_button_label,s.access_show_brand FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id=t.id WHERE t.slug=? AND t.status IN ('trial','active') LIMIT 1`).bind(slug).first<Record<string,unknown>>();if(!row)return json({data:null});return json({data:{name:row.public_name||row.name,primary_color:row.primary_color||'#169CFF',secondary_color:row.secondary_color||'#0B2B7C',headline:row.login_headline||'Entre no seu painel',message:row.login_message||'Acesse atendimento, vendas e operação em um só lugar.',button_label:row.login_button_label||'Entrar',logo_url:row.logo_key?`/api/public/login-brand/asset?tenant=${encodeURIComponent(slug)}&kind=logo`:null,background_url:row.login_background_key?`/api/public/login-brand/asset?tenant=${encodeURIComponent(slug)}&kind=background`:null,show_brand:Number(row.access_show_brand??1)!==0}});
  }
  if(method==='GET'&&url.pathname==='/api/public/login-brand/asset'){
    const slug=clean(url.searchParams.get('tenant'),80),kind=url.searchParams.get('kind');const row=await env.DB.prepare(`SELECT s.logo_key,s.login_background_key FROM tenants t JOIN tenant_settings s ON s.tenant_id=t.id WHERE t.slug=? LIMIT 1`).bind(slug).first<{logo_key:string|null;login_background_key:string|null}>();const key=kind==='background'?row?.login_background_key:row?.logo_key;return await asset(env,key||null)||json({error:'Arquivo não encontrado.'},404);
  }
  if(!url.pathname.startsWith('/api/platform/marketing'))return null;
  const actor=await authenticate(request,env);if(!actor)return json({error:'Sessão ausente.'},401);if(actor.actorType!=='platform_user'||actor.role!=='super_admin')return json({error:'Acesso exclusivo do Super Admin.'},403);
  if(method==='GET'&&url.pathname==='/api/platform/marketing'){const row=await env.DB.prepare(`SELECT * FROM platform_marketing WHERE id='default'`).first();return json({data:row});}
  if(method==='PATCH'&&url.pathname==='/api/platform/marketing'){let input:any={};try{input=await request.json()}catch{};await env.DB.prepare(`UPDATE platform_marketing SET hero_kicker=?,hero_title=?,hero_subtitle=?,video_title=?,video_description=?,updated_at=datetime('now') WHERE id='default'`).bind(clean(input.hero_kicker,120),clean(input.hero_title,120),clean(input.hero_subtitle,400),clean(input.video_title,120),clean(input.video_description,500)).run();await audit(env,actor,null,'platform.marketing.update','platform_marketing','default');return json({data:{ok:true}});}
  const upload=url.pathname.match(/^\/api\/platform\/marketing\/(logo-full|logo-icon|poster|video)$/);if(upload&&method==='PUT'){
    const kind=upload[1],type=(request.headers.get('content-type')||'').split(';')[0].toLowerCase();const isVideo=kind==='video';const ext=(isVideo?VIDEO_TYPES:IMAGE_TYPES).get(type);if(!ext)return json({error:isVideo?'Use MP4 ou WebM.':'Use PNG, JPG ou WebP.'},415);const data=await request.arrayBuffer();const max=isVideo?MAX_VIDEO:MAX_IMAGE;if(!data.byteLength||data.byteLength>max)return json({error:`Arquivo deve ter no máximo ${isVideo?'50 MB':'4 MB'}.`},413);const key=`platform/marketing/${kind}-${crypto.randomUUID()}.${ext}`;await env.FILES.put(key,data,{httpMetadata:{contentType:type}});const field=kind==='logo-full'?'logo_full_key':kind==='logo-icon'?'logo_icon_key':kind==='poster'?'hero_video_poster_key':'hero_video_key';const current=await env.DB.prepare(`SELECT ${field} old_key FROM platform_marketing WHERE id='default'`).first<{old_key:string|null}>();await env.DB.prepare(`UPDATE platform_marketing SET ${field}=?,updated_at=datetime('now') WHERE id='default'`).bind(key).run();if(current?.old_key)await env.FILES.delete(current.old_key);await audit(env,actor,null,'platform.marketing.asset.update','platform_marketing',kind,{size:data.byteLength,type});return json({data:{ok:true}});
  }
  return json({error:'Endpoint não encontrado.'},404);
}
