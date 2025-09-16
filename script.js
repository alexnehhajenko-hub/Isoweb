/* ===== Isopipe — простая рабочая версия ===== */

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

// --- Canvas & ctx
const cv = document.getElementById('isoCanvas');
const ctx = cv.getContext('2d', { alpha: false });

// состояние
let mode = 'idle';            // 'line' | 'erase' | 'symbol' | 'idle'
let firstPt = null;           // первая точка для линии
const segs   = [];            // {a:{x,y}, b:{x,y}}
const valves = [];            // {cx,cy,ang, lenPx}
const history = [];           // стеки для undo

// вид
const GRID_STEP = 140;        // шаг лёгкой изометрической сетки (px «на мире»)
let scale = 1;                // масштаб мира -> экран
let offsetX = 0, offsetY = 0; // панорамирование (не требуется в этой версии, держим 0)

// helpers
const scr = (x,y)=>({x:x*scale + offsetX, y:y*scale + offsetY});
const wor = (sx,sy)=>({x:(sx-offsetX)/scale, y:(sy-offsetY)/scale});

function resize(){
  const w = Math.floor(window.innerWidth  * DPR);
  const h = Math.floor((window.innerHeight - document.querySelector('.toolbar').offsetHeight) * DPR);
  if (cv.width !== w || cv.height !== h){
    cv.width = w; cv.height = h;
    draw();
  }
}
window.addEventListener('resize', resize, {passive:true});
resize();

// ===== Рисование =====
function drawGrid(){
  const s = GRID_STEP * scale * DPR / DPR;
  if (s < 40) return;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#e7e9f2';
  const w = cv.width, h = cv.height;

  // три семейства линий под 30°/90°/150°
  const angs = [30, 90, 150].map(a=>a*Math.PI/180);
  for (const ang of angs){
    const vx = Math.cos(ang), vy = Math.sin(ang);
    // нормаль
    const nx = -vy, ny = vx;

    // сколько полос нужно
    const need = Math.ceil(Math.max(w,h)/s) + 3;
    for (let k=-need; k<=need; k++){
      const bx = nx * (k*GRID_STEP), by = ny * (k*GRID_STEP);
      const A = scr(bx - vx*20000, by - vy*20000);
      const B = scr(bx + vx*20000, by + vy*20000);
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
  }
  ctx.restore();
}

function draw(){
  // фон
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,cv.width,cv.height);

  // сетка
  drawGrid();

  // линии труб
  ctx.lineCap='round'; ctx.lineJoin='round';
  for (const s of segs){
    const A=scr(s.a.x,s.a.y), B=scr(s.b.x,s.b.y);
    ctx.strokeStyle = '#6b35ff'; ctx.lineWidth = 10 * DPR; ctx.globalAlpha=.8;
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
    ctx.strokeStyle = '#7f62ff'; ctx.lineWidth = 6 * DPR; ctx.globalAlpha=1;
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
  }

  // вентили (EU-стиль: «бабочка» в коротком куске трубы + ручка)
  for (const v of valves) drawValve(v);
}

function drawValve(v){
  const len = v.lenPx;   // длина вставки по трубе в px мира
  const half = len/2;

  // локальный базис
  const ca = Math.cos(v.ang), sa = Math.sin(v.ang);
  const px = (t)=>({x: v.cx + ca*t, y: v.cy + sa*t});

  // сам «кусок трубы» поверх основной
  const A = scr(px(-half).x, px(-half).y);
  const B = scr(px( half).x, px( half).y);
  ctx.strokeStyle = '#6b35ff'; ctx.lineWidth = 10 * DPR; ctx.globalAlpha=.95;
  ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
  ctx.strokeStyle = '#7f62ff'; ctx.lineWidth = 6 * DPR; ctx.globalAlpha=1;
  ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();

  // «бабочка» (две треугольные створки ISO-стиля)
  ctx.save();
  const C = scr(v.cx, v.cy);
  ctx.translate(C.x, C.y);
  ctx.rotate(v.ang);
  const w = 7;           // «толщина трубы» символически (px экрана)
  const t = half - 4;    // треугольники не на самом краю
  ctx.fillStyle = '#5b2bff';

  // левый треугольник
  ctx.beginPath();
  ctx.moveTo(-t*DPR, 0);
  ctx.lineTo(-2*DPR, -w*DPR/2);
  ctx.lineTo(-2*DPR,  w*DPR/2);
  ctx.closePath(); ctx.fill();

  // правый треугольник
  ctx.beginPath();
  ctx.moveTo( t*DPR, 0);
  ctx.lineTo( 2*DPR, -w*DPR/2);
  ctx.lineTo( 2*DPR,  w*DPR/2);
  ctx.closePath(); ctx.fill();

  // ручка: короткая черта «вверх» для горизонтальной трубы,
  //       и «вперёд» (мы рисуем как поперечную короткую) для вертикальной.
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2*DPR;
  const up = 10*DPR;
  // ручка всегда перпендикулярна трубе
  ctx.beginPath();
  ctx.moveTo(0,0);
  ctx.lineTo(0,-up);
  ctx.stroke();

  ctx.restore();
}

// ===== Логика =====
function setMode(m){ mode = m; firstPt = null; }
function fitCanvas(){ scale = 1; offsetX=0; offsetY=0; draw(); }
function undo(){
  if (!history.length) return;
  const act = history.pop();
  if (act.type==='addSeg') segs.pop();
  if (act.type==='addValve') valves.pop();
  if (act.type==='splitSeg'){
    // вернуть исходный сегмент
    segs.splice(act.index, 2, act.original);
  }
  draw();
}
function clearCanvas(){
  segs.length=0; valves.length=0; firstPt=null; history.length=0; draw();
}

// ближайший сегмент и параметр t
function nearestSeg(sx,sy){
  const p = wor(sx,sy);
  let bestI=-1, bestT=0, bestD=1e9, bestA=null, bestB=null;
  segs.forEach((s,i)=>{
    const ax=s.a.x, ay=s.a.y, bx=s.b.x, by=s.b.y;
    const vx=bx-ax, vy=by-ay;
    const len2 = vx*vx+vy*vy; if(!len2) return;
    let t = ((p.x-ax)*vx + (p.y-ay)*vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px=ax+t*vx, py=ay+t*vy;
    const d = Math.hypot(px-p.x, py-p.y);
    if (d<bestD){ bestD=d; bestI=i; bestT=t; bestA={x:ax,y:ay}; bestB={x:bx,y:by}; }
  });
  return {i:bestI, t:bestT, d:bestD, A:bestA, B:bestB};
}

// разрез сегмента и вставка вентили
function insertValveAt(sx,sy){
  const hit = nearestSeg(sx,sy);
  if (hit.i<0 || hit.d > 20/scale){ return false; }
  const s = segs[hit.i];
  const ax=s.a.x, ay=s.a.y, bx=s.b.x, by=s.b.y;
  const vx=bx-ax, vy=by-ay;
  const ang = Math.atan2(vy,vx);

  // длина «кусочка трубы» под символ (≈40px экрана в мировых единицах)
  const lenScreenPx = 40;       // выглядит как «10 мм»
  const lenWorld = lenScreenPx/scale;

  // центр
  const cx = ax + vx*hit.t, cy = ay + vy*hit.t;

  // точки разделения
  const hx = (lenWorld/2) * Math.cos(ang);
  const hy = (lenWorld/2) * Math.sin(ang);
  const L = { a:{x:ax, y:ay}, b:{x:cx-hx, y:cy-hy} };
  const R = { a:{x:cx+hx, y:cy+hy}, b:{x:bx, y:by} };

  // заменить один сегмент на два
  segs.splice(hit.i, 1, L, R);

  // сам вентиль
  valves.push({ cx, cy, ang, lenPx: lenWorld });

  history.push({type:'splitSeg', index:hit.i, original:s});
  history.push({type:'addValve'});
  return true;
}

// удаление сегмента «ластиком» (тап около сегмента)
function eraseAt(sx,sy){
  const hit = nearestSeg(sx,sy);
  if (hit.i<0 || hit.d > 16/scale) return false;
  const removed = segs.splice(hit.i,1)[0];
  history.push({type:'addSeg'}); // обратная операция для undo
  return true;
}

// ===== Ввод =====
cv.addEventListener('pointerdown', (e)=>{
  const sx = e.clientX * DPR, sy = e.clientY * DPR;

  if (mode==='line'){
    if (!firstPt){
      firstPt = wor(sx,sy);
    } else {
      const second = wor(sx,sy);
      segs.push({ a:firstPt, b:second });
      history.push({type:'addSeg'});
      firstPt = null;
      draw();
    }
    return;
  }

  if (mode==='erase'){
    if (!eraseAt(sx,sy)) ; // мимо — ничего
    draw();
    return;
  }

  if (mode==='symbol'){
    if (!insertValveAt(sx,sy)) ; // мимо — ничего
    draw();
    return;
  }
}, {passive:true});

// первичный рендер
draw();

// ——— API для кнопок ———
window.setMode = setMode;
window.fitCanvas = fitCanvas;
window.undo = undo;
window.clearCanvas = clearCanvas;