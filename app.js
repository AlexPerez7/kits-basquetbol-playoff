const STAGES = [
  {k:'ot',        n:'OT',        ab:'OT', hex:'#6366F1', d:'Orden de trabajo confirmada', team:[]},
  {k:'diseno',    n:'Diseño',    ab:'DS', hex:'#A855F7', d:'Diseño gráfico del kit',      team:[]},
  {k:'impresion', n:'Impresión', ab:'IM', hex:'#EC4899', d:'Impresión',                   team:[]},
  {k:'estampado', n:'Estampado', ab:'ES', hex:'#F97316', d:'Estampado',                   team:[]},
  {k:'corte',     n:'Corte',     ab:'CO', hex:'#EAB308', d:'Corte de piezas',             team:[]},
  {k:'modista',   n:'Modista',   ab:'MD', hex:'#10B981', d:'Confección y costura',        team:[]},
  {k:'entrega',   n:'Entrega',   ab:'EN', hex:'#16A34A', d:'Entrega final al club',       team:[]},
];
const PRIOS={'Crítica':{cls:'p-critica',label:'Código Negro',rank:0},'Alta':{cls:'p-alta',label:'Alta',rank:1},'Media':{cls:'p-media',label:'Media',rank:2},'Baja':{cls:'p-baja',label:'Baja',rank:3}};
const PRODUCTS=['Polera','Short','Camiseta','Polerón','Polera reversible','Pantalón'];
// STAGES[].team y PEOPLE se completan en init() desde la tabla "responsables"
// de Supabase (ver applyResponsables) — acá quedan vacíos como placeholder.
let PEOPLE=[];
function applyResponsables(rows){
  const byStage={}; STAGES.forEach(s=>byStage[s.k]=[]);
  (rows||[]).forEach(r=>{ if(byStage[r.stage]) byStage[r.stage].push(r.name); });
  STAGES.forEach(s=>{ s.team=byStage[s.k]; });
  const seen=new Set(), people=[];
  STAGES.forEach(s=>s.team.forEach(n=>{ if(!seen.has(n)){ seen.add(n); people.push(n); } }));
  PEOPLE=people;
}
const stageIdx = k => STAGES.findIndex(s=>s.k===k);
const stageOf  = k => STAGES[stageIdx(k)];
const prioOf   = p => PRIOS[p] || PRIOS['Media'];
const stationsOf = name => STAGES.filter(s=>(s.team||[]).includes(name));

// ---------- Supabase ----------
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function rowToOT(r){
  return {
    id:r.id, club:r.club, items:r.items||[], prio:r.prio,
    prioPrev:r.prio_prev||undefined, resp:r.resp||'', stage:r.stage,
    notes:r.notes||'', created:r.created, returns:r.returns||[], history:r.history||[]
  };
}
function otToRow(o){
  return {
    id:o.id, club:o.club, items:o.items||[], prio:o.prio, prio_prev:o.prioPrev||null,
    resp:o.resp||'', stage:o.stage, notes:o.notes||'', created:o.created,
    returns:o.returns||[], history:o.history||[]
  };
}

let state={ots:[], comments:{}};
let filters={stage:'', club:'', prio:'', q:''};
let editingId=null, dragId=null, dragCol=null, pendingReturn=null, pendingAssign=null, currentView='board', modalItems=[];

// ---------- Helpers ----------
const PLAZO=21;
function fmtISO(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
const todayStr=()=>fmtISO(new Date());
const addDays=(iso,n)=>{ const d=new Date((iso||todayStr())+'T00:00:00'); d.setDate(d.getDate()+n); return fmtISO(d); };
const daysBetween=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);
const estimEntrega=o=>addDays(o.created, PLAZO);
const countdown=o=>{ const estim=estimEntrega(o); return {estim, rem:daysBetween(todayStr(), estim)}; };
const isLate=o=>o.stage!=='entrega' && countdown(o).rem<0;
const fmtDue=d=>{ if(!d) return '—'; const [y,m,dd]=d.split('-'); return `${dd}/${m}`; };
const fmtDate=d=>{ if(!d) return '—'; const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; };
const initials=n=>(n||'').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'—';
const otItems=o=> (o&&o.items&&o.items.length) ? o.items : (o&&o.prod?[{prod:o.prod,qty:o.qty||1}]:[]);
const otUnits=o=> otItems(o).reduce((s,it)=>s+(+it.qty||0),0);
const itemsLabel=o=>{ const its=otItems(o); return its.length? its.map(it=>`${it.prod} ×${it.qty}`).join(' · ') : '—'; };
const toMs=d=>new Date((d||todayStr())+'T00:00:00').getTime();
const getHistory=o=>(o&&o.history&&o.history.length)?o.history:[{stage:o.stage, at:toMs(o&&o.created), resp:(o&&o.resp)||''}];
const assignFor=k=>{ const t=(stageOf(k)||{}).team||[]; return t.length===1?t[0]:null; };
function fmtDur(ms){ if(ms<0)ms=0; const s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60), dd=Math.floor(h/24); if(dd>0) return `${dd}d ${h%24}h`; if(h>0) return `${h}h ${m%60}m`; if(m>0) return `${m}m`; return `${s}s`; }
function cssEsc(s){ return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g,'\\$&'); }

// ---------- Datos de ejemplo (solo para el botón "Reiniciar") ----------
function seed(){
  const today=new Date();
  const nowMs=Date.now();
  const d=off=>{const x=new Date(today); x.setDate(x.getDate()+off); return fmtISO(x);};
  const t=off=>Math.round(nowMs+off*86400000);
  const R={ot:'Valentina', diseno:'Alejandro', impresion:'Gonzi', estampado:'Maxi', corte:'Cami', modista:'Bernardita', entrega:'Nohemi'};
  const hist=(createdOff, stageK)=>{ const idx=stageIdx(stageK), span=-createdOff, per=span/(idx+1), h=[]; for(let i=0;i<=idx;i++){ h.push({stage:STAGES[i].k, at:t(createdOff+per*i), resp:R[STAGES[i].k]||''}); } return h; };
  return {seq:6, ots:[
    {id:'OT-2026-001', club:'Puente Alto', items:[{prod:'Camiseta',qty:15},{prod:'Short',qty:15}], prio:'Crítica', resp:'Alejandro', stage:'diseno', notes:'Colores azul/blanco, números 4–15.', created:d(-5), returns:[], history:hist(-5,'diseno')},
    {id:'OT-2026-002', club:'Español de Talca', items:[{prod:'Polera reversible',qty:12}], prio:'Media', resp:'Gonzi', stage:'impresion', notes:'Sublimación full, escudo bordado.', created:d(-18), returns:[{from:'impresion',to:'diseno',area:'Impresión',by:'Gonzi',motivo:'Archivo de impresión en baja resolución.',date:d(-13)}], history:hist(-18,'impresion')},
    {id:'OT-2026-003', club:'Ancud', items:[{prod:'Polerón',qty:20}], prio:'Baja', resp:'Cami', stage:'corte', notes:'Tallas mixtas S–XL.', created:d(-25), returns:[], history:hist(-25,'corte')},
    {id:'OT-2026-004', club:'Español de Osorno', items:[{prod:'Pantalón',qty:18},{prod:'Polera',qty:18}], prio:'Media', resp:'Valentina', stage:'ot', notes:'', created:d(-1), returns:[], history:hist(-1,'ot')},
    {id:'OT-2026-005', club:'Sportiva', items:[{prod:'Camiseta',qty:10}], prio:'Alta', resp:'Nohemi', stage:'entrega', notes:'Entregado en tienda.', created:d(-20), returns:[], history:hist(-20,'entrega')},
    {id:'OT-2026-006', club:'Selección Chilena', items:[{prod:'Camiseta',qty:16},{prod:'Short',qty:16},{prod:'Polera reversible',qty:8}], prio:'Alta', resp:'Bernardita', stage:'modista', notes:'La Roja del Basket — retro.', created:d(-12), returns:[], history:hist(-12,'modista')},
  ]};
}

// ---------- Init ----------
(async function init(){
  try{
    const [{data:otRows,error:e1}, {data:commentRows,error:e2}, {data:respRows,error:e3}] = await Promise.all([
      sb.from('ots').select('*'),
      sb.from('comments').select('*'),
      sb.from('responsables').select('*').order('id'),
    ]);
    if(e1) throw e1; if(e2) throw e2; if(e3) throw e3;
    const comments={}; (commentRows||[]).forEach(c=>comments[c.person]=c.text);
    applyResponsables(respRows);
    state = { ots:(otRows||[]).map(rowToOT), comments };
  }catch(err){
    console.error(err);
    toast('No se pudo conectar a la base de datos. Revisa supabase-config.js');
    state = {ots:[], comments:{}};
  }
  subscribeRealtime();
  buildPipeline(); buildStageSelects(); bindUI(); render();
})();

function buildPipeline(){
  const p=document.getElementById('pipeline'); p.innerHTML='';
  STAGES.forEach(s=>{
    const b=document.createElement('button');
    b.className='node'; b.dataset.k=s.k; b.title=s.d;
    b.innerHTML=`<span class="cnt" data-cnt="${s.k}">0</span><span class="dot" style="background:${s.hex}">${s.ab}</span><span class="nm">${s.n}</span>`;
    b.onclick=()=>{ filters.stage = filters.stage===s.k ? '' : s.k; switchView('board'); render(); };
    p.appendChild(b);
  });
}
function buildStageSelects(){
  document.getElementById('fStage').innerHTML=STAGES.map(s=>`<option value="${s.k}">${s.n}</option>`).join('');
  document.getElementById('rArea').innerHTML=STAGES.map(s=>`<option value="${s.n}">${s.n}</option>`).join('');
}

function visible(o){
  if(filters.stage && o.stage!==filters.stage) return false;
  if(filters.club && o.club!==filters.club) return false;
  if(filters.prio && o.prio!==filters.prio) return false;
  if(filters.q){ const t=(o.id+' '+o.club+' '+itemsLabel(o)+' '+(o.resp||'')).toLowerCase(); if(!t.includes(filters.q.toLowerCase())) return false; }
  return true;
}

// ---------- Render tablero ----------
function render(){
  const board=document.getElementById('board'); board.innerHTML='';
  document.getElementById('kpiActivas').textContent=state.ots.filter(o=>o.stage!=='entrega').length;
  document.getElementById('kpiEntreg').textContent=state.ots.filter(o=>o.stage==='entrega').length;
  document.getElementById('kpiAtras').textContent=state.ots.filter(isLate).length;
  document.getElementById('kpiCrit').textContent=state.ots.filter(o=>o.prio==='Crítica' && o.stage!=='entrega').length;

  STAGES.forEach(s=>{
    const n=state.ots.filter(o=>o.stage===s.k).length;
    const el=document.querySelector(`[data-cnt="${s.k}"]`);
    el.textContent=n; el.dataset.zero = n===0?'1':'0';
    document.querySelector(`.node[data-k="${s.k}"]`).classList.toggle('active', filters.stage===s.k);
  });

  const chip=document.getElementById('stageChip');
  if(filters.stage){ chip.style.display='inline-flex';
    chip.innerHTML=`Etapa: <b>${stageOf(filters.stage).n}</b><button aria-label="Quitar filtro">✕</button>`;
    chip.querySelector('button').onclick=()=>{filters.stage=''; render();};
  } else chip.style.display='none';

  const shown = filters.stage ? STAGES.filter(s=>s.k===filters.stage) : STAGES;
  shown.forEach(s=>{
    const list=state.ots.filter(o=>o.stage===s.k && visible(o)).sort((a,b)=>(prioOf(a.prio).rank-prioOf(b.prio).rank) || (estimEntrega(a)||'').localeCompare(estimEntrega(b)||''));
    const col=document.createElement('section'); col.className='col'; col.dataset.stage=s.k;
    col.innerHTML=`<div class="col-head"><span class="swatch" style="background:${s.hex}"></span><h3>${s.n}</h3><span class="num">${list.length}</span></div><div class="col-body"></div>`;
    const body=col.querySelector('.col-body');
    if(!list.length){ const e=document.createElement('div'); e.className='col-empty'; e.textContent='Sin OT en esta etapa'; body.appendChild(e); }
    list.forEach(o=>body.appendChild(cardEl(o)));
    board.appendChild(col);
  });

  refreshClubFilters();
  document.getElementById('foot').textContent=`${state.ots.length} OT en total · Los datos se comparten en vivo entre todas las pantallas.`;
  if(currentView==='resumen') renderResumen();
}

function cardEl(o){
  const s=stageOf(o.stage), i=stageIdx(o.stage), pr=prioOf(o.prio);
  const el=document.createElement('article'); el.className='card'+(o.prio==='Crítica'?' critical':'');
  el.style.setProperty('--sc',s.hex); el.draggable=true; el.dataset.id=o.id;
  el.addEventListener('dragstart',e=>{ dragId=o.id; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',o.id); requestAnimationFrame(()=>el.classList.add('dragging')); });
  el.addEventListener('dragend',()=>{ el.classList.remove('dragging'); clearDropTargets(); dragId=null; dragCol=null; });
  const rets=(o.returns||[]).length, delivered=o.stage==='entrega', cd=countdown(o);
  let cdCls,cdText,barCol,pct;
  if(delivered){ cdCls='cd-ok'; cdText='✓ Entregada'; barCol='var(--ok)'; pct=100; }
  else { const rem=cd.rem;
    cdCls = rem<0?'cd-late' : rem<=5?'cd-warn' : 'cd-ok';
    cdText = rem<0?`⏱ Atrasada ${-rem}d` : rem===0?'⏱ Vence hoy' : `⏱ ${rem} día${rem===1?'':'s'} rest.`;
    barCol = rem<0?'var(--alert)' : rem<=5?'#EAB308' : 'var(--ok)';
    const elapsed=Math.max(0,Math.min(PLAZO,daysBetween(o.created||todayStr(),todayStr())));
    pct = rem<0?100:Math.min(100,Math.round(elapsed/PLAZO*100));
  }
  el.innerHTML=`
    <div class="r1"><span class="ot" style="color:${o.prio==='Crítica'?'var(--black)':s.hex}">${o.id}</span>
      <span class="badge ${pr.cls}" style="margin-left:auto">${pr.label}</span></div>
    <div class="club">${esc(o.club)}</div>
    <div class="prod">${esc(itemsLabel(o))} · <b>${otUnits(o)} u.</b></div>
    <div class="clock">
      <div class="clock-row"><span class="cd ${cdCls}">${cdText}</span><span class="edate">Entrega est. ${fmtDue(cd.estim)}</span></div>
      <div class="bar"><span style="width:${pct}%; background:${barCol}"></span></div>
    </div>
    <div class="meta">
      ${rets?`<span class="ret" title="${esc((o.returns.at(-1)||{}).motivo||'')}">↩ ${rets} retroceso${rets>1?'s':''}</span>`:''}
      ${o.resp?`<span class="resp"><span class="av">${initials(o.resp)}</span>${esc(o.resp)}</span>`:''}
    </div>
    <div class="r-act">
      <button class="nav back" ${i===0?'disabled':''} title="Retroceder etapa">◀</button>
      <button class="nav fwd" ${i===STAGES.length-1?'disabled':''}>${i===STAGES.length-1?'Entregada ✓':'Avanzar ▶'}</button>
      <button class="cn-btn ${o.prio==='Crítica'?'on':''}" title="Código negro (prioridad crítica)">⬤</button>
      <button class="kebab" title="Editar">⋯</button>
    </div>`;
  el.querySelector('.back').onclick=()=>requestMove(o.id, i>0?STAGES[i-1].k:o.stage);
  el.querySelector('.fwd').onclick=()=>requestMove(o.id, i<STAGES.length-1?STAGES[i+1].k:o.stage);
  el.querySelector('.cn-btn').onclick=()=>toggleCodigoNegro(o.id);
  el.querySelector('.kebab').onclick=()=>openModal(o.id);
  return el;
}

// ---------- Movimiento ----------
function requestMove(id,key){
  const o=state.ots.find(x=>x.id===id); if(!o) return;
  const ci=stageIdx(o.stage), ti=stageIdx(key);
  if(ti<0||ti===ci) return;
  if(ti>ci){ const def=assignFor(key); if(def===null) openAssign(o,key); else applyForward(o,key,def); }
  else openReturn(o,key);
}
async function applyForward(o,key,resp){
  const newResp=resp||'';
  const newHistory=(o.history||[]).concat([{stage:key, at:Date.now(), resp:newResp}]);
  const updated={...o, resp:newResp, stage:key, history:newHistory};
  try{
    const {error}=await sb.from('ots').update(otToRow(updated)).eq('id', o.id);
    if(error) throw error;
  }catch(err){ console.error(err); toast('Error al mover la OT. Intenta de nuevo.'); return; }
  Object.assign(o, {resp:newResp, stage:key, history:newHistory});
  render();
  toast(`${o.id} → ${stageOf(key).n}${newResp?` · ${newResp}`:''}`);
}
function openAssign(o,key){
  pendingAssign={id:o.id, to:key};
  document.getElementById('aInfo').innerHTML=`<b>${o.id}</b> pasa a <b style="color:${stageOf(key).hex}">${stageOf(key).n}</b>. ¿Quién la toma?`;
  const team=stageOf(key).team||[];
  const box=document.getElementById('aOptions');
  box.innerHTML=team.map(p=>`<button class="btn assign-opt" data-p="${esc(p)}">${esc(p)}</button>`).join('')+`<button class="btn assign-opt" data-p="">Sin asignar</button>`;
  box.querySelectorAll('.assign-opt').forEach(b=>b.onclick=()=>{ const k=pendingAssign.to, o2=state.ots.find(x=>x.id===pendingAssign.id); closeAssign(); if(o2) applyForward(o2, k, b.dataset.p); });
  document.getElementById('scrim3').classList.add('open');
}
function closeAssign(){ document.getElementById('scrim3').classList.remove('open'); pendingAssign=null; }
async function toggleCodigoNegro(id){
  const o=state.ots.find(x=>x.id===id); if(!o) return;
  const goingCritical = o.prio!=='Crítica';
  const updated = goingCritical ? {...o, prioPrev:o.prio, prio:'Crítica'} : {...o, prio:o.prioPrev||'Media', prioPrev:null};
  try{
    const {error}=await sb.from('ots').update(otToRow(updated)).eq('id', id);
    if(error) throw error;
  }catch(err){ console.error(err); toast('Error al cambiar la prioridad.'); return; }
  Object.assign(o, updated);
  render();
  toast(goingCritical ? `${id} marcada CÓDIGO NEGRO` : `${id} → prioridad ${o.prio}`);
}

// ---------- Retroceso ----------
function openReturn(o, targetKey){
  pendingReturn={id:o.id, from:o.stage, to:targetKey};
  document.getElementById('rArea').value=stageOf(o.stage).n;
  document.getElementById('rBy').value=o.resp||'';
  document.getElementById('rMotivo').value='';
  document.getElementById('rInfo').innerHTML=`<b>${o.id}</b> retrocede de <b style="color:${stageOf(o.stage).hex}">${stageOf(o.stage).n}</b> → <b style="color:${stageOf(targetKey).hex}">${stageOf(targetKey).n}</b>`;
  fillRespReturn(targetKey, o.resp);
  document.getElementById('scrim2').classList.add('open');
  setTimeout(()=>document.getElementById('rMotivo').focus(),50);
}
function fillRespReturn(stageKey, current){
  const team=(stageOf(stageKey)||STAGES[0]).team||[];
  const preselect = team.includes(current) ? current : (team.length===1 ? team[0] : '');
  const opts='<option value="">— Sin asignar —</option>'+team.map(p=>`<option ${p===preselect?'selected':''}>${p}</option>`).join('');
  const sel=document.getElementById('rResp'); sel.innerHTML=opts; sel.value=preselect;
}
function closeReturn(){ document.getElementById('scrim2').classList.remove('open'); pendingReturn=null; }
async function confirmReturn(){
  if(!pendingReturn) return;
  const motivo=document.getElementById('rMotivo').value.trim();
  if(!motivo){ document.getElementById('rMotivo').focus(); toast('Indica el motivo del retroceso'); return; }
  const o=state.ots.find(x=>x.id===pendingReturn.id); if(!o){ closeReturn(); return; }
  const area=document.getElementById('rArea').value, by=document.getElementById('rBy').value.trim();
  const newResp=document.getElementById('rResp').value;
  const newReturns=(o.returns||[]).concat([{from:pendingReturn.from, to:pendingReturn.to, area, by, motivo, date:todayStr()}]);
  const newHistory=(o.history||[]).concat([{stage:pendingReturn.to, at:Date.now(), resp:newResp||''}]);
  const updated={...o, returns:newReturns, resp:newResp, history:newHistory, stage:pendingReturn.to};
  try{
    const {error}=await sb.from('ots').update(otToRow(updated)).eq('id', o.id);
    if(error) throw error;
  }catch(err){ console.error(err); toast('Error al registrar el retroceso.'); return; }
  Object.assign(o, {returns:newReturns, resp:newResp, history:newHistory, stage:pendingReturn.to});
  const dest=stageOf(pendingReturn.to).n; closeReturn(); render(); toast(`${o.id} retrocedió a ${dest}`);
}

// ---------- Modal OT ----------
function openModal(id){
  editingId=id||null;
  document.getElementById('mStale').style.display='none';
  document.getElementById('mTitle').textContent = id?`Editar ${id}`:'Nueva OT';
  document.getElementById('mDelete').style.display = id?'inline-block':'none';
  const o = id ? state.ots.find(x=>x.id===id) : null;
  gv('fClubName',o?.club);
  modalItems = otItems(o).map(it=>({prod:it.prod, qty:it.qty||1}));
  if(!modalItems.length) modalItems=[{prod:'',qty:1}];
  renderItemRows();
  document.getElementById('fPrioM').value=o?.prio||'Media';
  document.getElementById('fStage').value=o?.stage||'ot';
  fillResp(o?.stage||'ot', o?.resp);
  const inicio=document.getElementById('fInicio');
  inicio.value=o?.created||todayStr(); inicio.disabled=!!o;
  gv('fNotes',o?.notes);
  refreshPlazo(); renderHist(o); refreshClubList();
  document.getElementById('scrim').classList.add('open');
  setTimeout(()=>document.getElementById('fClubName').focus(),50);
}
function closeModal(){ document.getElementById('scrim').classList.remove('open'); editingId=null; }
function flagModalStale(){ const b=document.getElementById('mStale'); if(b) b.style.display='flex'; }

function renderItemRows(){
  const wrap=document.getElementById('itemsWrap'); wrap.innerHTML='';
  modalItems.forEach((it,idx)=>{
    const row=document.createElement('div'); row.className='item-row';
    let opts='<option value="">— Producto —</option>'+PRODUCTS.map(p=>`<option ${p===it.prod?'selected':''}>${p}</option>`).join('');
    if(it.prod && !PRODUCTS.includes(it.prod)) opts+=`<option selected>${esc(it.prod)}</option>`;
    row.innerHTML=`<select class="field prod-sel">${opts}</select>
      <input class="field qty-in" type="number" min="1" value="${it.qty||1}" aria-label="Cantidad">
      <button type="button" class="rm-item" ${modalItems.length<=1?'style="visibility:hidden"':''} title="Quitar">✕</button>`;
    row.querySelector('.prod-sel').onchange=e=>{ modalItems[idx].prod=e.target.value; };
    row.querySelector('.qty-in').oninput=e=>{ modalItems[idx].qty=Math.max(1,parseInt(e.target.value)||1); };
    row.querySelector('.rm-item').onclick=()=>{ modalItems.splice(idx,1); renderItemRows(); };
    wrap.appendChild(row);
  });
  document.getElementById('addItem').disabled = modalItems.length>=3;
}

function fillResp(stageKey, current){
  const team=(stageOf(stageKey)||STAGES[0]).team||[];
  let opts='<option value="">— Sin asignar —</option>'+team.map(p=>`<option ${p===current?'selected':''}>${p}</option>`).join('');
  if(current && !team.includes(current)) opts+=`<option selected>${esc(current)}</option>`;
  const sel=document.getElementById('fResp'); sel.innerHTML=opts; sel.value=current||'';
}

function refreshPlazo(){
  const base = editingId ? (state.ots.find(x=>x.id===editingId)?.created||todayStr()) : (val('fInicio')||todayStr());
  const est=addDays(base,PLAZO), rem=daysBetween(todayStr(),est);
  const o=editingId?state.ots.find(x=>x.id===editingId):null;
  const estado=(o&&o.stage==='entrega')?'Entregada':rem<0?`atrasada ${-rem} día(s)`:rem===0?'vence hoy':`${rem} día(s) restantes`;
  document.getElementById('plazoInfo').innerHTML=`⏱ Plazo: <b>${PLAZO} días</b> desde el inicio · Inicio: <b>${fmtDate(base)}</b><br>Entrega estimada: <b>${fmtDate(est)}</b> · <b>${estado}</b>`;
}

function renderHist(o){
  const wrap=document.getElementById('histWrap'), box=document.getElementById('histReturns');
  const rs=(o&&o.returns)||[];
  if(!rs.length){ wrap.style.display='none'; box.innerHTML=''; return; }
  wrap.style.display='block';
  box.innerHTML=rs.slice().reverse().map(r=>`
    <div class="hist-item">
      <div class="hist-top"><span>${esc(stageOf(r.from)?.n||r.from)} → ${esc(stageOf(r.to)?.n||r.to)}</span><span class="hist-date">${fmtDue(r.date)}</span></div>
      <div class="hist-motivo">${esc(r.motivo)}</div>
      <div class="hist-meta">Área: <b>${esc(r.area||'—')}</b>${r.by?` · Reportó: ${esc(r.by)}`:''}</div>
    </div>`).join('');
}

async function saveOT(){
  const club=val('fClubName').trim();
  if(!club){ document.getElementById('fClubName').focus(); toast('Ingresa el nombre del club'); return; }
  const items=modalItems.map(it=>({prod:it.prod, qty:Math.max(1,+it.qty||1)})).filter(it=>it.prod);
  if(!items.length){ toast('Agrega al menos un producto'); return; }
  const patch={ club, items, prio:val('fPrioM'), resp:val('fResp'), stage:val('fStage'), notes:val('fNotes').trim() };
  try{
    if(editingId){
      const o=state.ots.find(x=>x.id===editingId);
      let history=o.history||[];
      if(o.stage!==patch.stage) history=history.concat([{stage:patch.stage, at:Date.now(), resp:patch.resp||''}]);
      const updated={...o, ...patch, history};
      const {error}=await sb.from('ots').update(otToRow(updated)).eq('id', editingId);
      if(error) throw error;
      Object.assign(o, patch, {history});
      toast(`${editingId} actualizada`);
    }else{
      const created=val('fInicio')||todayStr();
      const {data:seqVal, error:seqErr}=await sb.rpc('next_ot_seq');
      if(seqErr) throw seqErr;
      const id='OT-2026-'+String(seqVal).padStart(3,'0');
      const o={ id, ...patch, created, returns:[], history:[{stage:patch.stage, at:toMs(created), resp:patch.resp||''}] };
      const {error}=await sb.from('ots').insert(otToRow(o));
      if(error) throw error;
      state.ots.push(o);
      toast(`${id} creada`);
    }
  }catch(err){ console.error(err); toast('Error al guardar la OT. Intenta de nuevo.'); return; }
  closeModal(); render();
}
async function deleteOT(){
  if(!editingId) return;
  if(!confirm(`¿Eliminar ${editingId}? Esta acción no se puede deshacer.`)) return;
  try{
    const {error}=await sb.from('ots').delete().eq('id', editingId);
    if(error) throw error;
  }catch(err){ console.error(err); toast('Error al eliminar la OT.'); return; }
  state.ots=state.ots.filter(x=>x.id!==editingId);
  closeModal(); render(); toast('OT eliminada');
}

// ---------- Resumen ----------
function switchView(v){
  currentView=v;
  document.getElementById('viewBoard').style.display = v==='board'?'':'none';
  document.getElementById('viewResumen').style.display = v==='resumen'?'':'none';
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.view===v));
  if(v==='resumen') renderResumen();
}
function renderResumen(){
  const counts={}; PEOPLE.forEach(p=>counts[p]=0);
  state.ots.filter(o=>o.stage!=='entrega').forEach(o=>{ if(o.resp){ counts[o.resp]=(counts[o.resp]||0)+1; } });
  const max=Math.max(1,...PEOPLE.map(p=>counts[p]||0));
  const grid=document.getElementById('teamGrid'); grid.innerHTML='';
  PEOPLE.forEach(p=>{
    const c=counts[p]||0, sts=stationsOf(p);
    const card=document.createElement('div'); card.className='person';
    card.innerHTML=`<div class="pname">${esc(p)}</div>
      <div class="stations">${sts.length?sts.map(s=>`<span class="st-dot" style="background:${s.hex}">${s.n}</span>`).join(''):'<span class="st-dot" style="background:#9AA3B2">Sin estación</span>'}</div>
      <div class="load"><span class="big">${c}</span><div class="lbar"><span style="width:${Math.round(c/max*100)}%"></span></div></div>
      <div class="load-lbl">OTs activas asignadas</div>
      <textarea data-person="${esc(p)}" placeholder="Comentarios generales…">${esc(state.comments?.[p]||'')}</textarea>`;
    grid.appendChild(card);
  });
  grid.querySelectorAll('textarea[data-person]').forEach(t=>{
    t.onchange=async()=>{
      const person=t.dataset.person, text=t.value;
      try{
        const {error}=await sb.from('comments').upsert({person, text});
        if(error) throw error;
      }catch(err){ console.error(err); toast('Error al guardar el comentario.'); return; }
      state.comments=state.comments||{}; state.comments[person]=text;
      toast('Comentario guardado');
    };
  });

  renderTiempos();

  const year=new Date().getFullYear();
  document.getElementById('histYear').textContent=year;
  const byClub={};
  state.ots.forEach(o=>{ if(String(o.created||'').slice(0,4)!=String(year)) return; const k=o.club||'—'; byClub[k]=byClub[k]||{ots:[],u:0,last:''}; byClub[k].ots.push(o); byClub[k].u+=otUnits(o); if((o.created||'')>byClub[k].last) byClub[k].last=o.created; });
  const rows=Object.entries(byClub).sort((a,b)=>b[1].u-a[1].u);
  const tb=document.getElementById('histBody'); tb.innerHTML='';
  if(!rows.length){ tb.innerHTML='<tr><td colspan="4" style="color:var(--muted)">Sin pedidos registrados este año.</td></tr>'; return; }
  let totO=0,totU=0;
  rows.forEach(([club,dd])=>{
    totO+=dd.ots.length; totU+=dd.u;
    const tr=document.createElement('tr'); tr.className='club-row'; tr.style.cursor='pointer';
    tr.innerHTML=`<td>▸ ${esc(club)}</td><td class="num">${dd.ots.length}</td><td class="num">${dd.u}</td><td>${fmtDate(dd.last)}</td>`;
    const detail=document.createElement('tr'); detail.style.display='none';
    detail.innerHTML=`<td colspan="4" style="background:#F7F9FC">${dd.ots.map(otDetailHtml).join('')}</td>`;
    tr.onclick=()=>{ const open=detail.style.display!=='none'; detail.style.display=open?'none':''; tr.firstElementChild.innerHTML=`${open?'▸':'▾'} ${esc(club)}`; };
    tb.appendChild(tr); tb.appendChild(detail);
  });
  const tot=document.createElement('tr'); tot.style.cssText='font-weight:700;background:#F9FAFC';
  tot.innerHTML=`<td>Total</td><td class="num">${totO}</td><td class="num">${totU}</td><td></td>`;
  tb.appendChild(tot);
}
function otDetailHtml(o){
  const procs=getHistory(o).map(h=>`<span class="proc"><i style="background:${(stageOf(h.stage)||{}).hex||'#999'}"></i>${esc((stageOf(h.stage)||{}).n||h.stage)}: <b>${esc(h.resp||'—')}</b></span>`).join('');
  return `<div class="ot-detail"><div class="ot-h"><b>${o.id}</b> · ${esc(itemsLabel(o))} · ${otUnits(o)} u. <span class="badge ${prioOf(o.prio).cls}">${prioOf(o.prio).label}</span></div><div class="proc-list">${procs}</div></div>`;
}
function renderTiempos(){
  const now=Date.now();
  const stat={}; STAGES.forEach(s=>stat[s.k]={completed:[],current:[],count:0});
  state.ots.forEach(o=>{
    const h=getHistory(o);
    for(let i=0;i<h.length;i++){
      const st=h[i].stage; if(!stat[st]) continue;
      const last=(i===h.length-1), end=last?now:h[i+1].at, dur=Math.max(0,end-h[i].at);
      if(last){ if(o.stage!=='entrega') stat[st].current.push(dur); }
      else stat[st].completed.push(dur);
    }
    if(stat[o.stage]) stat[o.stage].count++;
  });
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  document.getElementById('tiemposBody').innerHTML=STAGES.map(s=>{
    const c=stat[s.k], ah=avg(c.completed), ac=avg(c.current);
    return `<tr><td><span class="st-inline" style="background:${s.hex}"></span>${s.n}</td><td class="num">${c.count}</td><td class="num">${ah!=null?fmtDur(ah):'—'}</td><td class="num"><span class="clk" data-stage="${s.k}">${ac!=null?fmtDur(ac):'—'}</span></td></tr>`;
  }).join('');
  const leads=[]; state.ots.forEach(o=>{ if(o.stage!=='entrega')return; const h=getHistory(o); const ent=h.slice().reverse().find(x=>x.stage==='entrega'); if(ent) leads.push(ent.at - h[0].at); });
  const al=avg(leads);
  document.getElementById('leadStat').innerHTML = al!=null ? `⏱ Tiempo promedio total (inicio → entrega): <b>${fmtDur(al)}</b> · ${leads.length} OT entregada${leads.length>1?'s':''}` : 'Aún no hay OT entregadas para promediar el tiempo total.';
}
function tickClocks(){
  const cells=document.querySelectorAll('#tiemposBody .clk'); if(!cells.length) return;
  const now=Date.now(), cur={}; STAGES.forEach(s=>cur[s.k]=[]);
  state.ots.forEach(o=>{ if(o.stage==='entrega')return; const h=getHistory(o), last=h[h.length-1]; if(last && cur[last.stage]) cur[last.stage].push(now-last.at); });
  cells.forEach(c=>{ const a=cur[c.dataset.stage]||[]; c.textContent = a.length? fmtDur(a.reduce((x,y)=>x+y,0)/a.length) : '—'; });
}

// ---------- Tiempo real (Supabase Realtime) ----------
function setConnBanner(ok){
  const b=document.getElementById('connBanner'); if(!b) return;
  b.style.display = ok ? 'none' : 'flex';
}
function subscribeRealtime(){
  sb.channel('ots-changes')
    .on('postgres_changes', {event:'*', schema:'public', table:'ots'}, payload=>{
      if(payload.eventType==='DELETE'){
        const id=payload.old.id;
        state.ots=state.ots.filter(o=>o.id!==id);
        if(editingId===id){ closeModal(); toast('Esta OT fue eliminada por otro usuario.'); }
      } else {
        const o=rowToOT(payload.new);
        const idx=state.ots.findIndex(x=>x.id===o.id);
        if(idx>=0) state.ots[idx]=o; else state.ots.push(o);
        if(editingId===o.id) flagModalStale();
      }
      render();
    })
    .subscribe(status=>{ if(status==='SUBSCRIBED'||status==='CLOSED'||status==='TIMED_OUT'||status==='CHANNEL_ERROR') setConnBanner(status==='SUBSCRIBED'); });

  sb.channel('comments-changes')
    .on('postgres_changes', {event:'*', schema:'public', table:'comments'}, payload=>{
      const row=payload.new||payload.old; if(!row) return;
      state.comments=state.comments||{};
      if(payload.eventType==='DELETE'){ delete state.comments[row.person]; return; }
      state.comments[row.person]=row.text;
      const ta=document.querySelector(`textarea[data-person="${cssEsc(row.person)}"]`);
      if(ta && document.activeElement!==ta) ta.value=row.text;
    })
    .subscribe();
}

// ---------- Filtros / clubes ----------
function clubs(){return [...new Set(state.ots.map(o=>o.club))].sort();}
function refreshClubFilters(){
  const sel=document.getElementById('fClub'), cur=sel.value;
  sel.innerHTML='<option value="">Todos los clubes</option>'+clubs().map(c=>`<option>${esc(c)}</option>`).join('');
  sel.value=clubs().includes(cur)?cur:'';
}
function refreshClubList(){document.getElementById('clubList').innerHTML=clubs().map(c=>`<option>${esc(c)}</option>`).join('');}
function clearDropTargets(){document.querySelectorAll('.col.drop-target').forEach(c=>c.classList.remove('drop-target'));}

// ---------- UI ----------
function bindUI(){
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>switchView(t.dataset.view));
  document.getElementById('btnNew').onclick=()=>openModal(null);
  document.getElementById('mClose').onclick=closeModal;
  document.getElementById('mCancel').onclick=closeModal;
  document.getElementById('mSave').onclick=saveOT;
  document.getElementById('mDelete').onclick=deleteOT;
  document.getElementById('mStaleReload').onclick=()=>openModal(editingId);
  document.getElementById('addItem').onclick=()=>{ if(modalItems.length<3){ modalItems.push({prod:'',qty:1}); renderItemRows(); } };
  document.getElementById('fStage').onchange=e=>fillResp(e.target.value, val('fResp'));
  document.getElementById('fInicio').oninput=refreshPlazo;
  document.getElementById('scrim').onclick=e=>{if(e.target.id==='scrim')closeModal();};
  document.getElementById('rClose').onclick=closeReturn;
  document.getElementById('rCancel').onclick=closeReturn;
  document.getElementById('rConfirm').onclick=confirmReturn;
  document.getElementById('scrim2').onclick=e=>{if(e.target.id==='scrim2')closeReturn();};
  document.getElementById('aClose').onclick=closeAssign;
  document.getElementById('aCancel').onclick=closeAssign;
  document.getElementById('scrim3').onclick=e=>{if(e.target.id==='scrim3')closeAssign();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeReturn();closeAssign();}});
  setInterval(()=>{ if(currentView==='resumen') tickClocks(); }, 1000);
  document.getElementById('search').oninput=e=>{filters.q=e.target.value; render();};
  document.getElementById('fClub').onchange=e=>{filters.club=e.target.value; render();};
  document.getElementById('fPrio').onchange=e=>{filters.prio=e.target.value; render();};
  document.getElementById('btnReset').onclick=async()=>{
    if(!confirm('¿Reiniciar con los datos de ejemplo? Se borrarán las OT actuales para todas las pantallas.')) return;
    const seedData=seed();
    try{
      const {error:delOtsErr}=await sb.from('ots').delete().neq('id','');
      if(delOtsErr) throw delOtsErr;
      const {error:delCommentsErr}=await sb.from('comments').delete().neq('person','');
      if(delCommentsErr) throw delCommentsErr;
      const {error:seqErr}=await sb.from('meta').update({value:seedData.seq}).eq('key','seq');
      if(seqErr) throw seqErr;
      const {error:insErr}=await sb.from('ots').insert(seedData.ots.map(otToRow));
      if(insErr) throw insErr;
    }catch(err){ console.error(err); toast('Error al reiniciar los datos.'); return; }
    state={ots:seedData.ots, comments:{}};
    filters={stage:'',club:'',prio:'',q:''};
    document.getElementById('search').value=''; document.getElementById('fClub').value=''; document.getElementById('fPrio').value='';
    render(); toast('Datos reiniciados');
  };

  const board=document.getElementById('board');
  board.addEventListener('dragover',e=>{ const col=e.target.closest('.col'); if(!col) return; e.preventDefault(); e.dataTransfer.dropEffect='move'; if(col!==dragCol){ clearDropTargets(); col.classList.add('drop-target'); dragCol=col; } });
  board.addEventListener('drop',e=>{ e.preventDefault(); const col=e.target.closest('.col'); clearDropTargets(); dragCol=null; if(col && dragId){ const id=dragId; dragId=null; requestMove(id, col.dataset.stage); } });
  board.addEventListener('dragleave',e=>{ if(!e.relatedTarget || !board.contains(e.relatedTarget)){ clearDropTargets(); dragCol=null; } });
}

// ---------- utils ----------
function val(id){return document.getElementById(id).value;}
function gv(id,v){document.getElementById(id).value = v??'';}
function esc(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
let toastT;
function toast(msg){const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),1900);}
