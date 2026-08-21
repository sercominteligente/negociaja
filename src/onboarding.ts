/*
 * NegocIAJá! — desenvolvido pela SER Comunicação
 * CNPJ 23.296.513/0001-97
 * Todos os direitos reservados.
 */
import {Env,audit,authenticate,body,json} from './lib';

const COLOR=/^#[0-9a-fA-F]{6}$/;
const SEGMENTS=new Set(['loja','delivery','comunicacao-visual','servicos','custom','personalizado']);
const clean=(value:unknown,max:number)=>String(value??'').trim().slice(0,max);

export async function handleOnboarding(request:Request,env:Env,url:URL):Promise<Response|null>{
  if(!url.pathname.startsWith('/api/onboarding'))return null;
  const actor=await authenticate(request,env);if(!actor)return json({error:'Sessão ausente ou expirada.'},401);
  if(actor.actorType!=='tenant_user'||!actor.tenantId)return json({error:'Onboarding disponível apenas para empresas autenticadas.'},403);
  if(actor.role!=='admin')return json({error:'Apenas o administrador da empresa pode concluir o onboarding.'},403);
  const tenantId=actor.tenantId;const method=request.method.toUpperCase();
  if(method==='GET'&&url.pathname==='/api/onboarding'){
    const tenant=await env.DB.prepare(`SELECT t.id,t.slug,t.name,t.segment,t.status,s.public_name,s.legal_name,s.document,s.email,s.phone,s.whatsapp,s.primary_color,s.secondary_color,s.logo_key FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id=t.id WHERE t.id=? LIMIT 1`).bind(tenantId).first();
    const onboarding=await env.DB.prepare(`SELECT current_step,completed,completed_at,company_json,operations_json,channels_json,branding_json FROM tenant_onboarding WHERE tenant_id=? LIMIT 1`).bind(tenantId).first();
    return json({data:{tenant,onboarding:onboarding||{current_step:1,completed:0}}});
  }
  if(method==='PUT'&&url.pathname==='/api/onboarding'){
    const input=await body(request);
    const company=(input.company&&typeof input.company==='object'?input.company:{}) as Record<string,unknown>;
    const operations=(input.operations&&typeof input.operations==='object'?input.operations:{}) as Record<string,unknown>;
    const channels=(input.channels&&typeof input.channels==='object'?input.channels:{}) as Record<string,unknown>;
    const branding=(input.branding&&typeof input.branding==='object'?input.branding:{}) as Record<string,unknown>;
    const currentStep=Math.min(5,Math.max(1,Math.floor(Number(input.current_step||1))));const completed=Boolean(input.completed);
    const publicName=clean(company.public_name||company.name,120),legalName=clean(company.legal_name,180),document=clean(company.document,30),email=clean(company.email,254).toLowerCase(),phone=clean(company.phone,40),whatsapp=clean(channels.whatsapp,40);
    const requestedSegment=clean(operations.segment,60),segment=SEGMENTS.has(requestedSegment)?requestedSegment:'custom';
    const primary=clean(branding.primary_color,20)||'#169CFF',secondary=clean(branding.secondary_color,20)||'#0B2B7C';
    if(!COLOR.test(primary)||!COLOR.test(secondary))return json({error:'Cores devem usar formato hexadecimal, como #169CFF.'},400);
    if(email&&!email.includes('@'))return json({error:'E-mail comercial inválido.'},400);
    if(completed&&!publicName)return json({error:'Nome público da empresa é obrigatório para concluir.'},400);
    if(publicName)await env.DB.prepare(`UPDATE tenant_settings SET public_name=?,legal_name=?,document=?,email=?,phone=?,whatsapp=?,primary_color=?,secondary_color=? WHERE tenant_id=?`).bind(publicName,legalName||null,document||null,email||null,phone||null,whatsapp||null,primary,secondary,tenantId).run();
    await env.DB.prepare(`UPDATE tenants SET segment=? WHERE id=?`).bind(segment,tenantId).run();
    await env.DB.prepare(`INSERT INTO tenant_onboarding (tenant_id,current_step,completed,completed_at,company_json,operations_json,channels_json,branding_json,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(tenant_id) DO UPDATE SET current_step=excluded.current_step,completed=excluded.completed,completed_at=excluded.completed_at,company_json=excluded.company_json,operations_json=excluded.operations_json,channels_json=excluded.channels_json,branding_json=excluded.branding_json,updated_at=datetime('now')`).bind(tenantId,currentStep,completed?1:0,completed?new Date().toISOString():null,JSON.stringify({public_name:publicName,legal_name:legalName,document,email,phone}),JSON.stringify({...operations,segment}),JSON.stringify({...channels,whatsapp}),JSON.stringify({...branding,primary_color:primary,secondary_color:secondary})).run();
    await audit(env,actor,tenantId,completed?'onboarding.completed':'onboarding.updated','tenant',tenantId,{current_step:currentStep,segment});
    return json({data:{ok:true,current_step:currentStep,completed}});
  }
  return json({error:'Endpoint não encontrado.'},404);
}
