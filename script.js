import { drawValveOnScreen } from './valve.js';

/* ---------- базовое ---------- */
const DPR = Math.min(1.8, Math.max(1, window.devicePixelRatio || 1));
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha: false });

const state = {
  segs: [],          // [{a:{x,y}, b:{x,y}}]   (мировые координаты)
  valves: [],        // [{a:{x,y}, b:{x,y}}]
  photo: { img:null, w:0, h:0, alpha:0.9 },
  view: { cx:0, cy:0, s:1 }, // экран = (x*s+cx, y*s+cy)
  gridOn: true,
  mode: 'idle',      // 'idle'|'line'|'erase'|'valve'
  firstPt: null,
  history: []
};

function resize(){
  const W = Math.floor(innerWidth * DPR);
  const H = Math.floor((innerHeight - 56) * DPR);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; draw(); }
}
addEventListener('resize', resize);
addEventListener('orientationchange', ()=>setTimeout(resize,120), {passive:true});
resize();

/* ---------- преобразования ---------- */
const w2s = (x,y)=>({ x: state.view.cx + x*state.view.s, y: state.view.cy + y*state.view.s });
const s2w = (sx,sy)=>({ x: (sx - state.view.cx)/state.view.s, y: (sy - state.view.cy)/state.view.s });

/* ---------- сетка (лёгкая изо-сетка) ---------- */
function drawGrid(){
  if(!state.gridOn) return;
  ctx.save();
  const step = 200 * state.view.s;
  const need = Math.ceil(Math.max(cv.width, cv.height)/step) + 3;
  const angles = [30, 90, 150];
  for(const a of angles){
    const r = a*Math.PI/180, vx=Math.cos(r), vy=Math.sin(r), px=-vy, py=vx;
    for(let k=-need;k<=need;k++){
      const bx = px*k*200, by = py*k*200;
      const A = w2s(bx - vx*20000, by - vy*20000);
      const B = w2s(bx + vx*20000, by + vy*20000);
      ctx.globalAlpha = (k%3===0)? .24 : .12;
      ctx.strokeStyle = (k%3===0)? '#b9bfd0' : '#d7dbe4';
      ctx.lineWidth = (k%3===0)? 1.6 : 1.0;
      ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
    }
  }
  ctx.restore(); ctx.globalAlpha=1;
}

/* ---------- рисование сцены ---------- */
function draw(){
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);

  // фото
  const p = state.photo;
  if(p.img){
    ctx.save();
    ctx.globalAlpha = p.alpha;
    const s = state.view.s, cx = state.view.cx, cy = state.view.cy;
    const A = w2s(-p.w/2, -p.h/2);
    ctx.setTransform(1,0,0,1,0,0);  // рисуем напрямую по экрану
    ctx.translate(cx,cy); ctx.scale(s,s);
    ctx.drawImage(p.img, -p.w/2, -p.h/2, p.w, p.h);
    ctx.restore();
  }

  drawGrid();

  // трубы
  ctx.lineCap='round'; ctx.lineJoin='round';
  for(const s of state.segs){
    const A=w2s(s.a.x,s.a.y), B=w2s(s.b.x,s.b.y);
    ctx.strokeStyle='#5b00bf'; ctx.globalAlpha=.7; ctx.lineWidth=8*DPR;
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
    ctx.strokeStyle='#7b2cff'; ctx.globalAlpha=1; ctx.lineWidth=6*DPR;
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
  }

  // вентили
  for(const v of state.valves){
    const A=w2s(v.a.x,v.a.y), B=w2s(v.b.x,v.b.y);
    drawValveOnScreen(ctx, A, B, DPR);
  }

  // предпросмотр линии
  if(state.mode==='line' && state.firstPt && preview){
    const A=w2s(state.firstPt.x,state.firstPt.y), B=w2s(preview.x,preview.y);
    ctx.setLineDash([10,10]); ctx.strokeStyle='#16a34a'; ctx.lineWidth=4*DPR;
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
    ctx.setLineDash([]);
  }
}
let preview=null;

/* ---------- снапы ---------- */
function allNodes(){ const arr=[]; for(const s of state.segs){arr.push(s.a,s.b);} return arr; }
function snapNearNode(w, radiusPx=18){
  const R=radiusPx*DPR, sx=w2s(w.x,w.y).x, sy=w2s(w.x,w.y).y;
  let best=null, bd=1e9;
  for(const n of allNodes()){
    const ns=w2s(n.x,n.y); const d=Math.hypot(ns.x-sx,ns.y-sy);
    if(d<bd && d<=R){ bd=d; best=n; }
  }
  return best? {x:best.x,y:best.y} : w;
}
function snapAngle(from, to){
  const v={x:to.x-from.x, y:to.y-from.y};
  const L=Math.hypot(v.x,v.y); if(L===0) return to;
  const ang=Math.atan2(v.y,v.x);
  const targets=[0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI, -Math.PI/4,-Math.PI/2,-3*Math.PI/4];
  let best=ang, bd=1e9;
  for(const t of targets){ const d=Math.abs((ang-t+Math.PI*2)%(Math.PI*2)); const dd=Math.min(d,Math.PI*2-d); if(dd<bd){bd=dd;best=t;} }
  const res={x: from.x + Math.cos(best)*L, y: from.y + Math.sin(best)*L};
  return res;
}

/* ---------- геометрия ---------- */
function nearestPointOnSeg(w, s){
  const ax=s.a.x, ay=s.a.y, bx=s.b.x, by=s.b.y;
  const vx=bx-ax, vy=by-ay, wx=w.x-ax, wy=w.y-ay;
  const c2=vx*vx+vy*vy; if(c2===0) return {p:{x:ax,y:ay}, t:0};
  let t=(wx*vx+wy*vy)/c2; t=Math.max(0,Math.min(1,t));
  return { p:{x:ax+t*vx, y:ay+t*vy}, t };
}
function nearestSeg(w){
  let bi=-1, bd=1e9, bp=null;
  for(let i=0;i<state.segs.length;i++){
    const s=state.segs[i];
    const np=nearestPointOnSeg(w,s);
    const d=Math.hypot(np.p.x-w.x, np.p.y-w.y);
    if(d<bd){bd=d; bi=i; bp=np;}
  }
  return {index:bi, proj:bp, dist:bd};
}

/* ---------- режимы ---------- */
function setMode(m){
  state.mode=m; state.firstPt=null; preview=null;
}

/* ---------- ввод указателей ---------- */
const pointers=new Map();
let last1=null;
cv.addEventListener('pointerdown', e=>{
  cv.setPointerCapture?.(e.pointerId);
  const p = {x:e.clientX*DPR, y:(e.clientY-56)*DPR};
  pointers.set(e.pointerId, p);
  if(pointers.size===1) last1=p;

  // начало предпросмотра для линии
  if(state.mode==='line' && state.firstPt){
    const w=s2w(p.x,p.y); preview=snapAngle(state.firstPt, snapNearNode(w)); draw();
  }
}, {passive:true});

cv.addEventListener('pointermove', e=>{
  if(!pointers.has(e.pointerId)) return;
  const cur = {x:e.clientX*DPR, y:(e.clientY-56)*DPR};
  const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, cur);

  // масштаб/панорамирование (двумя пальцами)
  if(pointers.size>=2){
    const ids=[...pointers.keys()];
    const a=pointers.get(ids[0]), b=pointers.get(ids[1]);
    const ap=(ids[0]===e.pointerId?prev:a), bp=(ids[1]===e.pointerId?prev:b);
    const d0=Math.hypot(ap.x-bp.x, ap.y-bp.y), d1=Math.hypot(a.x-b.x, a.y-b.y);
    const c1={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
    if(d0>0){
      const f=d1/d0;
      const vx=c1.x-state.view.cx, vy=c1.y-state.view.cy;
      state.view.cx += vx - vx*f; state.view.cy += vy - vy*f;
      state.view.s  = Math.max(0.06*DPR, Math.min(state.view.s*f, 80*DPR));
    }
    draw(); last1=null; return;
  }

  // перетаскивание холста одним пальцем (вне режима рисования)
  if(state.mode==='idle' && last1){
    state.view.cx += (cur.x-last1.x);
    state.view.cy += (cur.y-last1.y);
    last1=cur; draw(); return;
  }

  // предпросмотр линии
  if(state.mode==='line' && state.firstPt){
    const w=s2w(cur.x,cur.y);
    preview = snapAngle(state.firstPt, snapNearNode(w));
    draw();
  }
}, {passive:true});

cv.addEventListener('pointerup', e=>{
  pointers.delete(e.pointerId);
  last1=(pointers.size===1)?[...pointers.values()][0]:null;

  const sx=e.clientX*DPR, sy=(e.clientY-56)*DPR;
  const w=s2w(sx,sy);

  // один тап = действие
  if(state.mode==='line'){
    if(!state.firstPt){
      state.firstPt = snapNearNode(w);
    }else{
      const a = state.firstPt;
      const b = snapAngle(a, snapNearNode(w));
      state.segs.push({a:{...a}, b:{...b}});
      state.history.push({type:'seg'});
      setMode('idle'); // ВАЖНО: после одной линии — в idle
      draw();
    }
    return;
  }

  if(state.mode==='erase'){
    // удалить ближайший сегмент/вентиль
    let bestType=null, bi=-1, bd=1e9;
    // сегменты
    for(let i=0;i<state.segs.length;i++){
      const np=nearestPointOnSeg(w,state.segs[i]);
      const d=Math.hypot(np.p.x-w.x, np.p.y-w.y);
      if(d<bd){bd=d; bestType='seg'; bi=i;}
    }
    // вентили (по центру)
    for(let i=0;i<state.valves.length;i++){
      const v=state.valves[i];
      const c={x:(v.a.x+v.b.x)/2, y:(v.a.y+v.b.y)/2};
      const d=Math.hypot(c.x-w.x, c.y-w.y);
      if(d<bd){bd=d; bestType='valve'; bi=i;}
    }
    if(bestType==='seg' && bd<=18/state.view.s*DPR){ state.segs.splice(bi,1); state.history.push({type:'erase'}); }
    else if(bestType==='valve' && bd<=22/state.view.s*DPR){ state.valves.splice(bi,1); state.history.push({type:'erase'}); }
    setMode('idle'); draw(); return;
  }

  if(state.mode==='valve'){
    // один тап → найти ближайший сегмент и поставить вентиль ориентированный по нему
    if(!state.segs.length){ setMode('idle'); return; }
    const near=nearestSeg(w);
    const s=state.segs[near.index];
    const P=near.proj.p;                        // центр вентили
    const dir={x:s.b.x-s.a.x, y:s.b.y-s.a.y};
    const len=Math.hypot(dir.x,dir.y)||1;
    // длина «кусочка» фиксированная в мировых единицах (не зависит от зума)
    const L=40;  // ≈ 10 мм визуально
    const ux=dir.x/len, uy=dir.y/len;
    const a={x:P.x-ux*L/2, y:P.y-uy*L/2};
    const b={x:P.x+ux*L/2, y:P.y+uy*L/2};
    state.valves.push({a,b});
    state.history.push({type:'valve'});
    setMode('idle'); draw(); return;
  }
}, {passive:true});

// колесо — масштаб к курсору/тапу
cv.addEventListener('wheel', e=>{
  e.preventDefault();
  const sx=e.clientX*DPR, sy=(e.clientY-56)*DPR;
  const f=(e.deltaY<0)?1.12:0.9;
  const vx=sx-state.view.cx, vy=sy-state.view.cy;
  state.view.cx += vx - vx*f; state.view.cy += vy - vy*f;
  state.view.s  = Math.max(0.06*DPR, Math.min(state.view.s*f, 80*DPR));
  draw();
}, {passive:false});

/* ---------- кнопки ---------- */
document.getElementById('bLine').onclick  = ()=> setMode('line');
document.getElementById('bErase').onclick = ()=> setMode('erase');
document.getElementById('bValve').onclick = ()=> setMode('valve');
document.getElementById('bGrid').onclick  = ()=>{ state.gridOn=!state.gridOn; draw(); };
document.getElementById('bUndo').onclick  = ()=>{
  const h=state.history.pop(); if(!h) return;
  if(h.type==='seg') state.segs.pop();
  if(h.type==='valve') state.valves.pop();
  if(h.type==='erase') {/* уже удалили */ }
  draw();
};
document.getElementById('bClear').onclick = ()=>{
  state.segs.length=0; state.valves.length=0; state.history.length=0;
  setMode('idle'); draw();
};
document.getElementById('bFit').onclick   = ()=>{
  // если есть фото — вписать его, иначе просто центр/масштаб 1
  if(state.photo.img){
    const p=state.photo, vw=cv.width/DPR, vh=cv.height/DPR;
    const sc=Math.min(vw/p.w, vh/p.h)*0.92;
    state.view.s=sc*DPR; state.view.cx=cv.width/2; state.view.cy=cv.height/2;
  }else{
    state.view.s=1*DPR; state.view.cx=cv.width/2; state.view.cy=cv.height/2;
  }
  draw();
};

// Фото как фон
document.getElementById('bPhoto').onclick = ()=> document.getElementById('fPhoto').click();
document.getElementById('fPhoto').onchange = e=>{
  const f=e.target.files?.[0]; if(!f) return;
  const url=URL.createObjectURL(f); const img=new Image();
  img.onload=()=>{
    URL.revokeObjectURL(url);
    state.photo.img=img; state.photo.w=img.width; state.photo.h=img.height;
    document.getElementById('bFit').click();
  };
  img.src=url;
};

/* ---------- старт ---------- */
(function boot(){
  state.view.cx = cv.width/2; state.view.cy = cv.height/2; state.view.s = 1*DPR;
  draw();
})();