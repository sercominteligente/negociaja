const base=process.env.HML_SMOKE_BASE_URL||'http://127.0.0.1:8788';
const auth=`Basic ${Buffer.from(`${process.env.HML_SMOKE_USERNAME||'homologacao'}:${process.env.HML_SMOKE_PASSWORD||'ci-hml-secret'}`).toString('base64')}`;
const headers={authorization:auth,'content-type':'application/json',origin:base};
const call=async(path,opt={})=>{const r=await fetch(base+path,{...opt,headers:{...headers,...(opt.headers||{})}});const text=await r.text();let p={};try{p=text?JSON.parse(text):{}}catch{}return{r,p,text}};
const assert=(x,m)=>{if(!x)throw new Error(m)};

console.log('Security/privacy/isolation smoke testing');
for(const path of ['/api/ops/orders/order_iso/history','/api/catalog/item_iso/variants','/api/ops/documents/doc_iso/pdf']){
  const {r}=await call(path,{headers:{authorization:auth}});
  assert(r.status===404||r.status===403,`cross-tenant resource leaked or wrong isolation status at ${path}: ${r.status}`);
}
const tool=await call('/api/assistant/tools/query',{method:'POST',body:JSON.stringify({tool:'customer_lookup',query:'SEGREDO-TENANT-ISO'})});
assert(tool.r.ok,`assistant lookup failed ${tool.r.status}`);
assert(Array.isArray(tool.p.data?.results)&&tool.p.data.results.length===0,'assistant tool leaked customer from another tenant');

const exp=await call('/api/privacy/export',{method:'POST',body:'{}'});
assert(exp.r.status===201,`privacy export returned ${exp.r.status}`);
assert(exp.p.data?.download_url,'privacy export missing download url');
const download=await call(exp.p.data.download_url,{headers:{authorization:auth}});
assert(download.r.ok,`privacy download returned ${download.r.status}`);
assert((download.r.headers.get('content-type')||'').includes('application/json'),'privacy export MIME incorrect');
assert(!download.text.includes('SEGREDO-TENANT-ISO'),'privacy export leaked another tenant');

const deletion=await call('/api/privacy/deletion',{method:'POST',body:JSON.stringify({confirm:'EXCLUIR DADOS'})});
assert(deletion.r.status===201||deletion.r.status===200,`deletion request returned ${deletion.r.status}`);
assert(deletion.p.data?.id,'deletion request missing id');
assert(deletion.p.data?.execute_after,'deletion request missing cooling-off date');
const cancel=await call(`/api/privacy/deletion/${encodeURIComponent(deletion.p.data.id)}/cancel`,{method:'POST',body:'{}'});
assert(cancel.r.ok&&cancel.p.data?.status==='cancelled','deletion cancellation failed');

let limited=false;
for(let i=0;i<25;i++){
  const x=await call('/api/privacy/deletion',{method:'POST',body:JSON.stringify({confirm:'INVALIDA'})});
  if(x.r.status===429){limited=true;assert(x.p.code==='rate_limited','rate limit response missing code');assert(x.r.headers.get('retry-after'),'rate limit missing retry-after');break}
}
assert(limited,'tenant route rate limiter did not trigger');
console.log('Tenant isolation, LGPD export/deletion guard and rate limiting smoke test passed.');
