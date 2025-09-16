// ---------- Параметры ----------
const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
const SNAP_PX = 16;          // радиус прилипания к узлам (в экр. пикселях)
const TAP_TOL_PX = 10;       // дрожание пальца, считаем кликом (px)
const LINE_W = 4;            // толщина линий (логические px, умножится на DPR)
const GRID_STEP = 200;       // шаг сетки в мировых единицах
const GRID_ALPHA = 0.14;     // прозрачность сетки

// ---------- Сцена (в МИРОВЫХ координатах) ----------
const segs = [];     // [{a:{x,y}, b:{x,y}}]
const valves = [];   // [{a:{x,y}, b:{x,y}}]

const view = { s:1, cx:0, cy:0 }; // экраны: Sx = cx + x*s,  Sy = cy + y*s

// ---------- DOM ----------
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', {alpha:false});
let W=0, H=0;

function resize(){
  const r=cv.getBoundingClientRect();
  W=Math.round(r.width*DPR); H=Math.round(r.height*DPR);
  cv.width=W; cv.height=H;
  if(view.cx===0 && view.cy===0){ view.cx=W/2; view.cy=H/2; view.s = 1*DPR; }
  draw();
}
window.addEventListener('resize', resize, {passive:true});
resize();

// ---------- Преобразования ----------
const w2s = (p)=>({ x:view.cx + p.x*view.s, y:view.cy + p.y*view.s });
const s2w = (sx,sy)=>({ x:(sx - view.cx)/view.s, y:(sy - view.cy)/view.s });

// ---------- Утилиты ----------
const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
function pointSegDist(p,a,b){
  const vx=b.x-a.x, vy=b.y-a.y, wx=p.x-a.x, wy=p.y-a.y;
  const c1=vx*wx+vy*wy; if(c1<=0) return dist(p,a);
  const c2=vx*vx+vy*vy; if(c2<=c1) return dist(p,b);
  const t=c1/c2, x=a.x+t*vx, y=a.y+t*vy;
  return Math.hypot(p.x-x, p.y-y);
}
function nearestEndpoint(pw){ // в мировых
  let best=null, bestD=1e9;
  for(const s of segs){
    for(const n of [s.a,s.b]){
      const d=dist(pw,n);
      if(d<bestD){ bestD=d; best=n; }
    }
  }
  const snapR = SNAP_PX / view.s;
  return (best && bestD<=snapR)? {x:best.x,y:best.y} : pw;
}
function findDirectionNear(pw){
  // ищем ближайший сегмент, чтобы ориентировать вентиль по трубе
  let best=null, bestD=1e9;
  for(const s of segs){
    const d = pointSegDist(pw, s.a, s.b);
    if(d<bestD){ bestD = d; best = s; }
  }
  if(!best) return {ux:1, uy:0};
  const L = Math.hypot(best.b.x-best.a.x, best.b.y-best.a.y) || 1;
  return { ux:(best.b.x-best.a.x)/L, uy:(best.b.y-best.a.y)/L };
}

// ---------- Рисование ----------
function drawGrid(){
  ctx.save();
  ctx.globalAlpha = GRID_ALPHA;
  ctx.strokeStyle = '#cfd3dc';
  ctx.lineWidth = 1;

  const angles = [30,90,150].map(a=>a*Math.PI/180);
  const halfDiagWorld = Math.max(W,H)/view.s;

  for(const a of angles){
    const vx=Math.cos(a), vy=Math.sin(a);
    const px=-vy, py=vx;

    const need = Math.ceil(halfDiagWorld/GRID_STEP)+3;
    for(let k=-need;k<=need;k++){
      const bx = px*k*GRID_STEP;
      const by = py*k*GRID_STEP;
      const A = w2s({x:bx - vx*99999, y:by - vy*99999});
      const B = w2s({x:bx + vx*99999, y:by + vy*99999});
      ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
    }
  }
  ctx.restore();
}

function draw(){
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  drawGrid();

  // трубы
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle='#7b2cff';
  ctx.lineWidth=LINE_W*DPR;
  for(const s of segs){
    const A=w2s(s.a), B=w2s(s.b);
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
  }

  // вентили (поверх)
  for(const v of valves){
    const A=w2s(v.a), B=w2s(v.b);
    drawValve(ctx, A, B, DPR);
  }

  // предпросмотр линии
  if(mode==='line' && first){
    const P = preview || first;
    const A=w2s(first), B=w2s(P);
    ctx.setLineDash([8,8]); ctx.strokeStyle='#16a34a'; ctx.lineWidth=Math.max(3,LINE_W*DPR-1);
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
    ctx.setLineDash([]);
    // маркеры
    ctx.fillStyle='#16a34a'; ctx.strokeStyle='#fff'; ctx.lineWidth=2;
    for(const s of [A,B]){
      ctx.beginPath(); ctx.arc(s.x,s.y,7,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }
  }
}

// ---------- История / сервис ----------
const history=[];
function pushHist(){ history.push(JSON.stringify({segs,valves})); if(history.length>60) history.shift(); }
function undo(){ if(!history.length) return; const s=JSON.parse(history.pop()); segs.length=0; valves.length=0; segs.push(...s.segs); valves.push(...s.valves); first=null; preview=null; draw(); }
window.undo = undo;
function clearAll(){ pushHist(); segs.length=0; valves.length=0; first=null; preview=null; draw(); }
window.clearAll = clearAll;
function fitView(){
  if(!segs.length && !valves.length){ view.s=1*DPR; view.cx=W/2; view.cy=H/2; return draw(); }
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  const all=[];
  segs.forEach(s=>all.push(s.a,s.b));
  valves.forEach(v=>all.push(v.a,v.b));
  for(const p of all){ if(p.x<minx)minx=p.x; if(p.y<miny)miny=p.y; if(p.x>maxx)maxx=p.x; if(p.y>maxy)maxy=p.y; }
  const pad=120/ (view.s||1);
  minx-=pad; miny-=pad; maxx+=pad; maxy+=pad;
  const w=maxx-minx, h=maxy-miny;
  const s=Math.min(W/w, H/h);
  view.s = Math.max(0.6*DPR, Math.min(s, 6*DPR));
  const cxWorld=(minx+maxx)/2, cyWorld=(miny+maxy)/2;
  view.cx = W/2 - cxWorld*view.s;
  view.cy = H/2 - cyWorld*view.s;
  draw();
}
window.fitView = fitView;

// ---------- Режимы ----------
let mode='idle';  // 'line' | 'erase' | 'valve' | 'idle'
let first=null, preview=null;
function setMode(m){ mode=m; first=null; preview=null; }
window.setMode = setMode;

// ---------- Жесты ----------
const pointers=new Map();
let down=null;

cv.addEventListener('pointerdown', e=>{
  cv.setPointerCapture?.(e.pointerId);
  const p={x:e.clientX*DPR, y:e.clientY*DPR};
  pointers.set(e.pointerId,p);
  down={id:e.pointerId, start:p, moved:false};
});

cv.addEventListener('pointermove', e=>{
  if(!pointers.has(e.pointerId)) return;
  const cur={x:e.clientX*DPR, y:e.clientY*DPR};
  const prev=pointers.get(e.pointerId);
  pointers.set(e.pointerId,cur);
  if(down && e.pointerId===down.id && dist(cur,down.start)>TAP_TOL_PX*DPR) down.moved=true;

  // пинч-зум/пан: две точки
  if(pointers.size>=2){
    const ids=[...pointers.keys()];
    const a=pointers.get(ids[0]), b=pointers.get(ids[1]);
    const ap=(ids[0]===e.pointerId?prev:a), bp=(ids[1]===e.pointerId?prev:b);

    const midPrev={x:(ap.x+bp.x)/2, y:(ap.y+bp.y)/2};
    const midCur ={x:(a.x +b.x )/2, y:(a.y +b.y )/2};
    const dPrev=Math.hypot(ap.x-bp.x, ap.y-bp.y), dCur=Math.hypot(a.x-b.x, a.y-b.y);

    // мир-точка под центром пинча
    const wMidPrev = s2w(midPrev.x, midPrev.y);

    // масштаб
    if(dPrev>0){
      let f=dCur/dPrev;
      const newS = Math.max(0.6*DPR, Math.min(view.s*f, 6*DPR));
      // фиксируем ту же мировую точку под пальцами
      view.cx = midCur.x - wMidPrev.x*newS;
      view.cy = midCur.y - wMidPrev.y*newS;
      view.s  = newS;
      draw();
    }
    return;
  }

  if(mode==='line' && first){
    preview = nearestEndpoint( s2w(cur.x,cur.y) );
    draw();
  }
}, {passive:true});

cv.addEventListener('pointerup', e=>{
  const up={x:e.clientX*DPR, y:e.clientY*DPR};
  const wasTap = down && down.id===e.pointerId && !down.moved;
  pointers.delete(e.pointerId); down=null;

  if(!wasTap) return;

  const pw = nearestEndpoint( s2w(up.x, up.y) );

  if(mode==='line'){
    if(!first){ first=pw; preview=null; draw(); }
    else{
      if(dist(first,pw) >= (2/view.s)){ // не нулевая длина
        pushHist();
        segs.push({a:first, b:pw});
      }
      first=null; preview=null; draw();
    }
    return;
  }

  if(mode==='erase'){
    const hit = (12 / view.s); // радиус в МИРОВЫХ
    let best=-1, bestD=1e9;
    for(let i=0;i<segs.length;i++){
      const d = pointSegDist(pw, segs[i].a, segs[i].b);
      if(d<bestD){ bestD=d; best=i; }
    }
    if(best!==-1 && bestD<=hit){ pushHist(); segs.splice(best,1); draw(); }
    return;
  }

  if(mode==='valve'){
    // ориентируем по ближайшей трубе, иначе — горизонтально
    const dir = findDirectionNear(pw); // unit
    const len = 36 / view.s;  // ~10 мм на экране (зависит от масштаба)
    const a = { x: pw.x - dir.ux*len/2, y: pw.y - dir.uy*len/2 };
    const b = { x: pw.x + dir.ux*len/2, y: pw.y + dir.uy*len/2 };
    pushHist();
    // добавим короткий трубный сегмент (чтобы было «продолжение») + сам символ
    segs.push({a:{...a}, b:{...b}});
    valves.push({a,b});
    // ставим ОДИН — остаёмся в idle, чтобы случайные тап-дубли не ставились
    setMode('idle');
    draw();
    return;
  }
}, {passive:true});

// колесо (на десктопе)
cv.addEventListener('wheel', e=>{
  e.preventDefault();
  const sx=e.clientX*DPR, sy=e.clientY*DPR;
  const w=s2w(sx,sy);
  const f= (e.deltaY<0)? 1.12 : 0.9;
  const newS=Math.max(0.6*DPR, Math.min(view.s*f, 6*DPR));
  view.cx = sx - w.x*newS;
  view.cy = sy - w.y*newS;
  view.s  = newS;
  draw();
}, {passive:false});

// стартовый кадр
draw();