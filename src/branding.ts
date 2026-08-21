/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,audit,authenticate,json} from './lib';

const ALLOWED_LOGO_TYPES=new Map([
  ['image/png','png'],
  ['image/jpeg','jpg'],
  ['image/webp','webp']
]);
const MAX_LOGO_BYTES=2*1024*1024;
const COLOR_RE=/^#[0-9a-fA-F]{6}$/;

export async function handleBranding(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(!url.pathname.startsWith('/api/branding'))return null;
  const actor=await authenticate(request,env);
  if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  if(actor.actorType!=='tenant_user'||!actor.tenantId)return json({error:'Identidade disponível apenas para empresas autenticadas.'},403);
  const tenantId=actor.tenantId;
  const method=request.method.toUpperCase();

  if(method==='GET'&&url.pathname==='/api/branding'){
    const row=await env.DB.prepare(`SELECT public_name,primary_color,secondary_color,logo_key FROM tenant_settings WHERE tenant_id=? LIMIT 1`).bind(tenantId).first<{public_name:string|null;primary_color:string|null;secondary_color:string|null;logo_key:string|null}>();
    return json({data:{public_name:row?.public_name||null,primary_color:row?.primary_color||'#169CFF',secondary_color:row?.secondary_color||'#0B2B7C',has_logo:Boolean(row?.logo_key),logo_url:row?.logo_key?'/api/branding/logo':null}});
  }

  if(method==='PATCH'&&url.pathname==='/api/branding'){
    if(actor.role!=='admin')return json({error:'Apenas o administrador pode alterar a identidade.'},403);
    let input:Record<string,unknown>={};try{input=await request.json() as Record<string,unknown>;}catch{}
    const publicName=input.public_name===undefined?undefined:String(input.public_name||'').trim();
    const primary=input.primary_color===undefined?undefined:String(input.primary_color||'');
    const secondary=input.secondary_color===undefined?undefined:String(input.secondary_color||'');
    if(primary!==undefined&&!COLOR_RE.test(primary))return json({error:'Cor principal inválida.'},400);
    if(secondary!==undefined&&!COLOR_RE.test(secondary))return json({error:'Cor secundária inválida.'},400);
    const current=await env.DB.prepare(`SELECT public_name,primary_color,secondary_color FROM tenant_settings WHERE tenant_id=?`).bind(tenantId).first<{public_name:string|null;primary_color:string|null;secondary_color:string|null}>();
    await env.DB.prepare(`UPDATE tenant_settings SET public_name=?,primary_color=?,secondary_color=? WHERE tenant_id=?`).bind(publicName===undefined?current?.public_name||null:publicName,primary===undefined?current?.primary_color||'#169CFF':primary,secondary===undefined?current?.secondary_color||'#0B2B7C':secondary,tenantId).run();
    await audit(env,actor,tenantId,'branding.update','tenant',tenantId,{public_name:publicName,primary_color:primary,secondary_color:secondary});
    return json({data:{ok:true}});
  }

  if(method==='PUT'&&url.pathname==='/api/branding/logo'){
    if(actor.role!=='admin')return json({error:'Apenas o administrador pode alterar o logotipo.'},403);
    const type=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    const extension=ALLOWED_LOGO_TYPES.get(type);
    if(!extension)return json({error:'Formato não permitido. Use PNG, JPG ou WebP.'},415);
    const declared=Number(request.headers.get('content-length')||0);
    if(declared>MAX_LOGO_BYTES)return json({error:'Logotipo excede o limite de 2 MB.'},413);
    const bytes=await request.arrayBuffer();
    if(!bytes.byteLength)return json({error:'Arquivo vazio.'},400);
    if(bytes.byteLength>MAX_LOGO_BYTES)return json({error:'Logotipo excede o limite de 2 MB.'},413);
    const old=await env.DB.prepare('SELECT logo_key FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first<{logo_key:string|null}>();
    const key=`tenants/${tenantId}/branding/logo-${crypto.randomUUID()}.${extension}`;
    await env.FILES.put(key,bytes,{httpMetadata:{contentType:type,cacheControl:'private, max-age=3600'}});
    await env.DB.prepare('UPDATE tenant_settings SET logo_key=? WHERE tenant_id=?').bind(key,tenantId).run();
    if(old?.logo_key&&old.logo_key!==key)await env.FILES.delete(old.logo_key);
    await audit(env,actor,tenantId,'branding.logo.update','tenant',tenantId,{content_type:type,size_bytes:bytes.byteLength});
    return json({data:{ok:true,logo_url:'/api/branding/logo',size_bytes:bytes.byteLength}});
  }

  if(method==='DELETE'&&url.pathname==='/api/branding/logo'){
    if(actor.role!=='admin')return json({error:'Apenas o administrador pode remover o logotipo.'},403);
    const row=await env.DB.prepare('SELECT logo_key FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first<{logo_key:string|null}>();
    if(row?.logo_key)await env.FILES.delete(row.logo_key);
    await env.DB.prepare('UPDATE tenant_settings SET logo_key=NULL WHERE tenant_id=?').bind(tenantId).run();
    await audit(env,actor,tenantId,'branding.logo.delete','tenant',tenantId);
    return json({data:{ok:true}});
  }

  if(method==='GET'&&url.pathname==='/api/branding/logo'){
    const row=await env.DB.prepare('SELECT logo_key FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first<{logo_key:string|null}>();
    if(!row?.logo_key)return json({error:'Logotipo não cadastrado.'},404);
    const object=await env.FILES.get(row.logo_key);
    if(!object)return json({error:'Arquivo do logotipo não encontrado.'},404);
    const headers=new Headers();object.writeHttpMetadata(headers);headers.set('etag',object.httpEtag);headers.set('cache-control','private, max-age=3600');headers.set('x-content-type-options','nosniff');
    return new Response(object.body,{headers});
  }

  return json({error:'Endpoint não encontrado.'},404);
}
