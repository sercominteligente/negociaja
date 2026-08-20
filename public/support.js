(()=>{
  const $=(s,p=document)=>p.querySelector(s);const $$=(s,p=document)=>[...p.querySelectorAll(s)];
  let mode='technical';let threadId='';
  const money=(c)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(c)||0)/100);
  const toast=(m)=>{const e=$('#toast');if(!e)return;e.textContent=String(m);e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2600)};
  const api=async(path,opt={})=>{const h={...(opt.headers||{})};if(opt.body!==undefined&&!h['content-type'])h['content-type']='application/json';const r=await fetch(path,{...opt,headers:h});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||'Erro ao comunicar com o suporte.');return p.data};

  const open=()=>{$('#supportDrawer')?.classList.add('open');$('#supportDrawer')?.setAttribute('aria-hidden','false');setTimeout(()=>$('#supportInput')?.focus(),180)};
  const close=()=>{$('#supportDrawer')?.classList.remove('open');$('#supportDrawer')?.setAttribute('aria-hidden','true')};
  const add=(who,text)=>{const box=$('#supportMessages');if(!box)return;const a=document.createElement('article');a.className=who;a.textContent=String(text);box.append(a);box.scrollTop=box.scrollHeight};

  async function ask(message){const q=String(message||'').trim();if(!q)return;add('user',q);const input=$('#supportInput');if(input)input.value='';const send=$('#supportForm button');if(send)send.disabled=true;const wait=document.createElement('article');wait.className='assistant pending';wait.textContent='Analisando o contexto desta empresa…';$('#supportMessages')?.append(wait);try{const data=await api('/api/support/chat',{method:'POST',body:JSON.stringify({message:q,mode,thread_id:threadId||undefined,page:location.pathname+location.hash})});threadId=data.thread_id||threadId;wait.remove();add('assistant',data.answer||'Não consegui gerar uma resposta agora.')}catch(e){wait.remove();add('assistant','Não consegui acessar o suporte agora. Tente novamente.');toast(e.message)}finally{if(send)send.disabled=false}}

  async function loadBilling(){try{const data=await api('/api/billing/summary');const banner=$('#planBanner');if(!banner)return;banner.hidden=false;$('#planTitle').textContent=data.plan_name||'Plano NegocIAJá';$('#planStatus').textContent=String(data.status||'').replace('_',' ').toUpperCase()||'HML';const days=data.days_remaining;const price=Number(data.price_monthly_cents||0);let msg='Validade não configurada.';if(Number.isFinite(days)){if(days<0)msg=`Seu plano venceu há ${Math.abs(days)} dia(s). Regularize para manter a operação.`;else if(days===0)msg='Seu plano vence hoje.';else msg=`Seu plano vence em ${days} dia(s).`;}if(price>0)msg+=` Renovação: ${money(price)}.`;$('#planMessage').textContent=msg;banner.dataset.urgency=days!==null&&days<=7?'high':'normal'}catch(e){console.warn('billing summary unavailable',e)}}

  $('#supportFab')?.addEventListener('click',open);$('#supportNav')?.addEventListener('click',(e)=>{e.preventDefault();open()});$('#openSupportInline')?.addEventListener('click',open);$('#closeSupport')?.addEventListener('click',close);
  $$('.support-mode button').forEach(b=>b.addEventListener('click',()=>{$$('.support-mode button').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.mode||'technical';$('#supportContext').textContent=mode==='technical'?'Ajuda sobre uso, configurações, integrações e erros do NegocIAJá.':'Orientação baseada nos dados operacionais desta empresa.'}));
  $$('.support-quick button').forEach(b=>b.addEventListener('click',()=>{open();ask(b.dataset.supportQuestion)}));
  $('#supportForm')?.addEventListener('submit',(e)=>{e.preventDefault();ask($('#supportInput')?.value)});
  $('#renewPlanBtn')?.addEventListener('click',()=>{open();mode='technical';$$('.support-mode button').forEach(x=>x.classList.toggle('active',x.dataset.mode==='technical'));ask('Quero renovar ou antecipar o pagamento do meu plano. Quais opções estão disponíveis?')});
  document.addEventListener('keydown',(e)=>{if(e.key==='Escape')close()});
  loadBilling();
})();
