const base=process.env.HML_SMOKE_BASE_URL||'http://127.0.0.1:8788';
const username=process.env.HML_SMOKE_USERNAME||'homologacao';
const password=process.env.HML_SMOKE_PASSWORD||'ci-hml-secret';
const authorization=`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const headers={'content-type':'application/json',origin:base,authorization};
const assert=(c,m)=>{if(!c)throw new Error(m)};
const json=async(path,opt={})=>{const r=await fetch(`${base}${path}`,{...opt,headers:{authorization,...(opt.headers||{})}});const p=await r.json().catch(()=>({}));return{r,p}};

console.log('HML document + binary PDF smoke testing');
const item=await json('/api/catalog',{method:'POST',headers,body:JSON.stringify({name:`Documento CI ${Date.now()}`,item_type:'service',category:'CI-DOC',price_cents:3575})});
assert(item.r.status===201,`document catalog setup returned ${item.r.status}`);
const itemId=item.p.data?.id;assert(itemId,'document test catalog item missing id');
const order=await json('/api/orders',{method:'POST',headers,body:JSON.stringify({customer_name:'Cliente Documento CI',customer_phone:'5585999988888',source:'ci-doc',items:[{catalog_item_id:itemId,qty:2}]})});
assert(order.r.status===201,`document order setup returned ${order.r.status}`);
const orderId=order.p.data?.id;assert(orderId,'document test order missing id');
const issued=[];
for(const [type,prefix] of [['quote','ORC-'],['order','PED-'],['receipt','REC-'],['invoice','FAT-']]){
  const out=await json(`/api/ops/documents/${type}/${encodeURIComponent(orderId)}`,{method:'POST',headers,body:'{}'});
  assert(out.r.status===201,`${type} issuance returned ${out.r.status}`);
  assert(String(out.p.data?.document_number||'').startsWith(prefix),`${type} number does not use ${prefix}`);
  assert(out.p.data?.view_url,`${type} missing view URL`);
  assert(out.p.data?.pdf_url,`${type} missing PDF URL`);
  const view=await fetch(`${base}${out.p.data.view_url}`,{headers:{authorization}});const html=await view.text();assert(view.status===200,`${type} view returned ${view.status}`);assert((view.headers.get('content-type')||'').includes('text/html'),`${type} view is not HTML`);assert(html.includes(out.p.data.document_number),`${type} snapshot view missing document number`);assert(html.includes('Cliente Documento CI'),`${type} snapshot view missing customer`);
  const pdf=await fetch(`${base}${out.p.data.pdf_url}`,{headers:{authorization}});const bytes=new Uint8Array(await pdf.arrayBuffer());assert(pdf.status===200,`${type} PDF returned ${pdf.status}`);assert((pdf.headers.get('content-type')||'').includes('application/pdf'),`${type} PDF content type invalid`);assert(bytes.length>500,`${type} PDF too small`);assert(new TextDecoder().decode(bytes.slice(0,5))==='%PDF-',`${type} binary is not a PDF`);
  const pdf2=await fetch(`${base}${out.p.data.pdf_url}`,{headers:{authorization}});const bytes2=new Uint8Array(await pdf2.arrayBuffer());assert(bytes2.length===bytes.length,`${type} persisted PDF size changed unexpectedly`);
  issued.push(out.p.data.document_number);
}
const docs=await json('/api/ops/documents');assert(docs.r.ok,`document list returned ${docs.r.status}`);assert(Array.isArray(docs.p.data),'document list must be array');for(const number of issued)assert(docs.p.data.some((d)=>d.document_number===number),`document ${number} missing from list`);
console.log('HML document issuance + binary PDF/R2 smoke test passed.');
