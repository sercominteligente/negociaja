const base=process.env.HML_SMOKE_BASE_URL||'http://127.0.0.1:8788';
const auth=`Basic ${Buffer.from(`${process.env.HML_SMOKE_USERNAME||'homologacao'}:${process.env.HML_SMOKE_PASSWORD||'ci-hml-secret'}`).toString('base64')}`;
const headers={'content-type':'application/json',origin:base,authorization:auth};
const get=async(path)=>{const r=await fetch(base+path,{headers:{authorization:auth}});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${path} -> ${r.status} ${p.error||''}`);return p.data};
const send=async(path,method,body={})=>{const r=await fetch(base+path,{method,headers,body:JSON.stringify(body)});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${p.error||''}`);return p.data};
const assert=(v,m)=>{if(!v)throw new Error(m)};
console.log('Core 1-12 smoke testing',base);
const catalog=await get('/api/catalog');assert(Array.isArray(catalog)&&catalog.length>0,'catalog must have at least one item');const item=catalog[0];
let inventory=await get('/api/inventory');assert(Array.isArray(inventory.items),'inventory items missing');
const stock=await send(`/api/inventory/${encodeURIComponent(item.id)}/movement`,'POST',{movement_type:'adjustment',qty:12,note:'CI baseline'});assert(stock.balance_after===12,'stock adjustment failed');
const orders=await get('/api/orders');let order=orders[0];if(!order){order=await send('/api/orders','POST',{customer_name:'Cliente Core12',customer_phone:'5585999995555',source:'ci-core12',items:[{catalog_item_id:item.id,qty:1}]});}
const edited=await send(`/api/ops/orders/${encodeURIComponent(order.id)}`,'PATCH',{status:'confirmed',delivery_cents:900,discount_cents:100,notes:'Pedido atualizado pelo CI'});assert(edited.status==='confirmed','order edit failed');assert(Number(edited.total_cents)>0,'order total invalid');
const rec=await send(`/api/ops/orders/${encodeURIComponent(order.id)}/receivable`,'POST',{});assert(rec.id,'receivable creation failed');
let fin=await get('/api/finance/receivables');const target=fin.items.find(x=>x.id===rec.id);assert(target,'receivable not listed');const remaining=Number(target.amount_cents)-Number(target.paid_cents);assert(remaining>0,'receivable should have balance');
if(remaining>1){const partial=Math.max(1,Math.floor(remaining/2));const p1=await send(`/api/finance/receivables/${encodeURIComponent(rec.id)}/pay`,'POST',{amount_cents:partial,method:'pix_manual',note:'CI partial'});assert(['partial','paid'].includes(p1.status),'partial payment failed');fin=await get('/api/finance/receivables');const after=fin.items.find(x=>x.id===rec.id);const rest=Number(after.amount_cents)-Number(after.paid_cents);if(rest>0){const p2=await send(`/api/finance/receivables/${encodeURIComponent(rec.id)}/pay`,'POST',{amount_cents:rest,method:'pix_manual',note:'CI settlement'});assert(p2.status==='paid','final payment failed');}}
const context=await get('/api/assistant/operational-context');assert(context.orders&&context.finance&&context.stock,'assistant operational context incomplete');
const onboarding=await get('/api/onboarding/progress');assert(onboarding.tenant_id==='tenant_demo','onboarding tenant mismatch');
inventory=await get('/api/inventory');assert(inventory.movements.some(x=>x.catalog_item_id===item.id),'stock movement not persisted');
console.log('Core 1-12 integrated smoke test passed.');
