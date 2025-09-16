// === ПАРАМЕТРЫ ТОЧНОСТИ ===
const SNAP_PX = 14;        // радиус снапа к узлам (px)
const TAP_TOL_PX = 8;      // сколько «дрожания» пальца считать кликом (px)
const LINE_WIDTH = 4;      // толщина линий (в логических px, умножится на DPR)
const GRID_ALPHA = 0.12;   // прозрачность сетки
// ==========================

const cv = document.getElementById('isoCanvas');
const hud = document.getElementById('toolbar');
const ctx = cv.getContext('2d', { alpha:false });
const DPR = Math.max(1, Math.min(devicePixelRatio||1, 2));
let W=0,H=0;

const state = {
  mode: 'idle',        // 'line' | 'erase' | 'idle'
  first: null,         // первая точка линии (в экранных координатах)
  segs: [],            // массив сегментов {a:{x,y}, b:{x,y}}
  history: [],
  view: { s:1*DPR, cx:0, cy:0 }, // масштаб и центр (экран)
  placingValve: false, // флаг «поставить один вентиль»
};

function resize(){
  const r = cv.getBoundingClientRect();
  W = Math.round(r.width*DPR);
  H = Math.round(r.height*DPR);
  cv.width = W; cv.height = H;
  if(state.view.cx===0 && state.view.cy===0){ state.view.cx=W/2; state.view.cy=H/2; }
  draw();
}
window.addEventListener('resize', resize);
resize();

// ---- Утилиты координат (здесь всё в экранных px) ----
function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function snapToNode(p){
  let best=null, bestD=1e9;
  for(const s of state.segs){
    for(const n of [s.a,s.b]){
      const d = dist(p,n);
      if(d<bestD){ bestD=d; best=n; }
    }
  }
  return (bestD <= SNAP_PX*DPR) ? {x:best.x,y:best.y} : p;
}

// ---- Рисование ----
function drawGrid(){
  ctx.save();
  ctx.globalAlpha = GRID_ALPHA;
  ctx.strokeStyle = '#cfd3dc';
  ctx.lineWidth = 1;
  const step = 180 * state.view.s;   // крупная изометрическая сетка не нужна, дадим лёгкие диагонали
  const need = 3 + Math.ceil(Math.max(W,H)/step);
  const angles = [30, 90, 150];
  for(const deg of angles){
    const a = deg*Math.PI/180, vx=Math.cos(a), vy=Math.sin(a);
    for(let k=-need;k<=need;k++){
      const bx = state.view.cx + (-vy)*k*step;
      const by = state.view.cy + ( vx)*k*step;
      ctx.beginPath();
      ctx.moveTo(bx - vx*99999, by - vy*99999);
      ctx.lineTo(bx + vx*99999, by + vy*99999);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function draw(){
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H);
  drawGrid();

  // линии
  ctx.lineCap='round'; ctx.lineJoin='round';
  for(const s of state.segs){
    ctx.strokeStyle = '#7b2cff';
    ctx.lineWidth = LINE_WIDTH*DPR;
    ctx.beginPath(); ctx.moveTo(s.a.x,s.a.y); ctx.lineTo(s.b.x,s.b.y); ctx.stroke();
  }

  // предпросмотр второй точки
  if(state.mode==='line' && state.first && state._preview){
    ctx.setLineDash([8,8]);
    ctx.strokeStyle='#16a34a';
    ctx.lineWidth = Math.max(3, LINE_WIDTH*DPR-1);
    ctx.beginPath(); ctx.moveTo(state.first.x,state.first.y); ctx.lineTo(state._preview.x,state._preview.y); ctx.stroke();
    ctx.setLineDash([]);
    // маркеры
    ctx.fillStyle='#16a34a'; ctx.strokeStyle='#fff'; ctx.lineWidth=2;
    for(const p of [state.first,state._preview]){
      ctx.beginPath(); ctx.arc(p.x,p.y,7,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }
  }
}

// ---- История ----
function pushHistory(){ state.history.push(JSON.stringify(state.segs)); if(state.history.length>50) state.history.shift(); }
function undo(){ if(!state.history.length) return; state.segs = JSON.parse(state.history.pop()); state.first=null; state._preview=null; draw(); }
window.undo = undo;
function clearCanvas(){ pushHistory(); state.segs=[]; state.first=null; state._preview=null; draw(); }
window.clearCanvas = clearCanvas;
function fitCanvas(){ state.view.s=1*DPR; state.view.cx=W/2; state.view.cy=H/2; draw(); }
window.fitCanvas = fitCanvas;

// ---- Режимы ----
function setMode(m){ state.mode=m; state.first=null; state._preview=null; state.placingValve=false; }
window.setMode = setMode;
function prepareValve(){ setMode('idle'); state.placingValve=true; } // поставить ОДИН вентиль
window.prepareValve = prepareValve;

// ---- Взаимодействие (тач/мышь) ----
let pointers=new Map();
let downInfo=null;

cv.addEventListener('pointerdown', (e)=>{
  cv.setPointerCapture?.(e.pointerId);
  const p = {x:e.clientX*DPR, y:e.clientY*DPR};
  pointers.set(e.pointerId,p);
  downInfo = {id:e.pointerId, start:p, moved:false};
});

cv.addEventListener('pointermove',(e)=>{
  if(!pointers.has(e.pointerId)) return;
  const p = {x:e.clientX*DPR, y:e.clientY*DPR};
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId,p);

  if(downInfo && e.pointerId===downInfo.id){
    if(dist(downInfo.start,p)>TAP_TOL_PX*DPR) downInfo.moved=true;
  }

  // два пальца — пан/зум
  if(pointers.size>=2){
    const ids=[...pointers.keys()];
    const a=pointers.get(ids[0]), b=pointers.get(ids[1]);
    const ap=(ids[0]===e.pointerId?prev:a), bp=(ids[1]===e.pointerId?prev:b);
    const d0=Math.hypot(ap.x-bp.x, ap.y-bp.y), d1=Math.hypot(a.x-b.x, a.y-b.y);
    if(d0>0){
      const f=d1/d0;
      const cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
      state.view.cx = cx + (state.view.cx - cx)*f;
      state.view.cy = cy + (state.view.cy - cy)*f;
      state.view.s  = Math.max(0.6*DPR, Math.min(state.view.s*f, 6*DPR));
      draw();
    }
    return;
  }

  // предпросмотр второй точки
  if(state.mode==='line' && state.first){
    state._preview = snapToNode(p);
    draw();
  }
});

cv.addEventListener('pointerup',(e)=>{
  const p = {x:e.clientX*DPR, y:e.clientY*DPR};
  const wasTap = downInfo && !downInfo.moved && downInfo.id===e.pointerId;
  pointers.delete(e.pointerId); downInfo=null;

  if(!wasTap) return;

  // ОДИН вентиль за клик по кнопке «Символ»
  if(state.placingValve){
    // короткий кусок 10 мм ~ визуально 36 px на обычных экранах; привязываем к DPR
    const len = 36*DPR;
    const a = { x:p.x-len/2, y:p.y };
    const b = { x:p.x+len/2, y:p.y };
    pushHistory();
    // труба-«коротыш» (чтобы визуально было продолжение)
    state.segs.push({a:{...a}, b:{...b}});
    // сам символ
    drawValve(ctx, a, b, DPR);
    // выключаем режим — чтобы следующий ставился только после повторного нажатия кнопки
    state.placingValve=false;
    return draw();
  }

  if(state.mode==='line'){
    if(!state.first){
      state.first = snapToNode(p);
      state._preview=null;
      return draw();
    }else{
      const second = snapToNode(p);
      // игнорируем «нулевые» линии
      if(dist(state.first, second) >= 2*DPR){
        pushHistory();
        state.segs.push({a:state.first, b:second});
      }
      state.first=null; state._preview=null;
      return draw();
    }
  }

  if(state.mode==='erase'){
    // удаляем ближайший сегмент при попадании в его окрестность
    const hitR = 10*DPR;
    let best=-1, bestD=1e9;
    for(let i=0;i<state.segs.length;i++){
      const s=state.segs[i];
      const d=pointSegDist(p, s.a, s.b);
      if(d<bestD){ bestD=d; best=i; }
    }
    if(best!==-1 && bestD<=hitR){
      pushHistory();
      state.segs.splice(best,1);
      draw();
    }
  }
});

// расстояние от точки до отрезка (в экранных px)
function pointSegDist(p,a,b){
  const vx=b.x-a.x, vy=b.y-a.y, wx=p.x-a.x, wy=p.y-a.y;
  const c1=vx*wx+vy*wy; if(c1<=0) return dist(p,a);
  const c2=vx*vx+vy*vy; if(c2<=c1) return dist(p,b);
  const t=c1/c2, x=a.x+t*vx, y=a.y+t*vy;
  return Math.hypot(p.x-x, p.y-y);
}