/* IsoPipe (минимальная веб-версия) — полностью переписано
   Режимы: Линия (две точки), Ластик (удалить ближайший сегмент),
           Символ (вставить вентиль в ближайшую трубу).
   Зум: пинч и колесо, Fit, Undo, Очистить.
*/

(() => {
  // ---------- БАЗА ----------
  const DPR = Math.min(1.5, Math.max(1, window.devicePixelRatio||1));
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d', {alpha:false});
  const toastEl = document.getElementById('toast');

  const toast=(t,ms=900)=>{
    toastEl.textContent=t; toastEl.classList.add('show');
    setTimeout(()=>toastEl.classList.remove('show'),ms);
  };

  // ---------- ВИД ----------
  const view = { cx:0, cy:0, s:1 };
  function resize(){
    const w = Math.floor((innerWidth)*DPR);
    const h = Math.floor((innerHeight-64)*DPR);
    if (cv.width!==w || cv.height!==h){
      cv.width=w; cv.height=h;
      draw();
    }
  }
  window.addEventListener('resize', resize);

  const Mode = { idle:'idle', line:'line', erase:'erase', symbol:'symbol' };
  let mode = Mode.idle;

  // ---------- ДАННЫЕ ----------
  const segs = [];    // {a:{x,y}, b:{x,y}}
  const symbols = []; // {x,y,angle,size}
  let history = [];

  let firstPt = null;

  // ---------- УТИЛЫ ----------
  const screenToWorld = (sx,sy)=>({ x:(sx - view.cx)/view.s, y:(sy - view.cy)/view.s });
  const worldToScreen = (x,y)=>({ x:view.cx + x*view.s, y:view.cy + y*view.s });

  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

  function snapToNodes(raw){
    const R = 18*DPR;
    let best=null, bestD=Infinity;
    for (const s of segs){
      const A=worldToScreen(s.a.x,s.a.y), B=worldToScreen(s.b.x,s.b.y);
      const dA=Math.hypot(A.x-(raw.x*view.s+view.cx), A.y-(raw.y*view.s+view.cy));
      const dB=Math.hypot(B.x-(raw.x*view.s+view.cx), B.y-(raw.y*view.s+view.cy));
      if(dA<bestD && dA<=R){ best={...s.a}; bestD=dA; }
      if(dB<bestD && dB<=R){ best={...s.b}; bestD=dB; }
    }
    return best || raw;
  }

  function saveHistory(){
    history.push({
      segs: JSON.parse(JSON.stringify(segs)),
      symbols: JSON.parse(JSON.stringify(symbols))
    });
    if (history.length>100) history.shift();
  }

  // ---------- РИСОВАНИЕ ----------
  function drawGrid(){
    const step = 180; // «изометрическая» лёгкая
    const alpha=.10;
    ctx.save();
    ctx.lineWidth=1; ctx.strokeStyle='#cfd3dc';

    const s = step*view.s;
    if (s<30){ ctx.restore(); return; }

    // диагонали (30°/150°) и горизонтали
    const lines = [
      Math.PI/6,                  // 30°
      Math.PI/2,                  // 90°
      Math.PI - Math.PI/6         // 150°
    ];

    for (const ang of lines){
      const vx=Math.cos(ang), vy=Math.sin(ang);
      const px=-vy, py=vx;
      const need = Math.ceil(Math.max(cv.width,cv.height)/s)+2;
      for (let k=-need;k<=need;k++){
        const bx=px*k*step, by=py*k*step;
        const A=worldToScreen(bx - vx*20000, by - vy*20000);
        const B=worldToScreen(bx + vx*20000, by + vy*20000);
        ctx.globalAlpha=alpha;
        ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function draw(){
    // фон
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);

    // сетка
    drawGrid();

    // сегменты
    ctx.lineCap='round'; ctx.lineJoin='round';
    for (const s of segs){
      const A=worldToScreen(s.a.x,s.a.y), B=worldToScreen(s.b.x,s.b.y);
      // обводка
      ctx.strokeStyle='#5b2eff'; ctx.lineWidth=10; ctx.globalAlpha=.25;
      ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
      // сама труба
      ctx.strokeStyle='#7b2cff'; ctx.lineWidth=8; ctx.globalAlpha=1;
      ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
    }

    // символы
    for (const it of symbols){
      const S = worldToScreen(it.x,it.y);
      drawValveSymbol(ctx, S.x, S.y, it.angle, it.size);
    }
  }

  // ---------- ВСТАВКА СИМВОЛА В ТРУБУ ----------
  function insertValveAtWorld(pW){
    // найти ближайший сегмент
    let bestI=-1, bestD=Infinity, bestT=0, bestAng=0, bestP=null;
    const R = 24/view.s; // радиус поиска в мире
    for (let i=0;i<segs.length;i++){
      const s=segs[i];
      const v={x:s.b.x-s.a.x,y:s.b.y-s.a.y};
      const w={x:pW.x-s.a.x,y:pW.y-s.a.y};
      const len2=v.x*v.x+v.y*v.y; if(len2===0) continue;
      let t = (v.x*w.x+v.y*w.y)/len2; t=Math.max(0,Math.min(1,t));
      const P={x:s.a.x+v.x*t, y:s.a.y+v.y*t};
      const d=dist(P,pW);
      if(d<bestD){ bestD=d; bestI=i; bestT=t; bestP=P; bestAng=Math.atan2(v.y,v.x); }
    }
    if (bestI===-1 || bestD>R){ toast('Нет трубы рядом'); return; }

    // разрезаем сегмент и вставляем символ
    const s = segs[bestI];
    const v={x:s.b.x-s.a.x,y:s.b.y-s.a.y};
    const len=Math.hypot(v.x,v.y);
    const keep = Math.max(6/view.s, len*0.06); // вырез маленького кусочка

    const dir={x:v.x/len, y:v.y/len};
    const P0={x:bestP.x-dir.x*keep, y:bestP.y-dir.y*keep};
    const P1={x:bestP.x+dir.x*keep, y:bestP.y+dir.y*keep};

    // заменить на два куска (если есть смысл)
    const leftLen = Math.hypot(P0.x-s.a.x, P0.y-s.a.y);
    const rightLen= Math.hypot(s.b.x-P1.x, s.b.y-P1.y);
    const repl=[];
    if (leftLen>1e-4)  repl.push({a:{...s.a}, b:P0});
    if (rightLen>1e-4) repl.push({a:P1, b:{...s.b}});
    saveHistory();
    segs.splice(bestI,1,...repl);

    // добавить символ
    symbols.push({ x:bestP.x, y:bestP.y, angle:bestAng, size:28 });
    draw();
  }

  // ---------- ВВОД ----------
  const ZOOM = { min:0.4*DPR, max:8*DPR, step:1.12 };
  let pointers=new Map();
  let last1=null;

  cv.addEventListener('pointerdown', (e)=>{
    cv.setPointerCapture?.(e.pointerId);
    const p={x:e.clientX*DPR,y:e.clientY*DPR};
    pointers.set(e.pointerId,p);
    if (pointers.size===1) last1=p;
  }, {passive:true});

  cv.addEventListener('pointermove', (e)=>{
    if (!pointers.has(e.pointerId)) return;
    const cur={x:e.clientX*DPR, y:e.clientY*DPR};
    const prev=pointers.get(e.pointerId); pointers.set(e.pointerId,cur);

    if (pointers.size>=2){
      const ids=[...pointers.keys()];
      const a=pointers.get(ids[0]), b=pointers.get(ids[1]);
      const ap=(ids[0]===e.pointerId?prev:a), bp=(ids[1]===e.pointerId?prev:b);
      const dPrev=Math.hypot(ap.x-bp.x,ap.y-bp.y), dCur=Math.hypot(a.x-b.x,a.y-b.y);
      if (dPrev>0){
        const cCur={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
        const f=dCur/dPrev;
        const nx = Math.max(ZOOM.min, Math.min(view.s*f, ZOOM.max));
        const k = nx / view.s;
        view.cx += (cCur.x - view.cx) - (cCur.x - view.cx)*k;
        view.cy += (cCur.y - view.cy) - (cCur.y - view.cy)*k;
        view.s = nx;
        draw();
      }
      last1=null; return;
    }

    // перетаскивание полотна (idle)
    if (last1 && mode===Mode.idle){
      view.cx += cur.x-last1.x;
      view.cy += cur.y-last1.y;
      last1=cur;
      draw();
    }
  }, {passive:true});

  function endPtr(e){ pointers.delete(e.pointerId); last1=(pointers.size===1)?[...pointers.values()][0]:null; }
  cv.addEventListener('pointerup', endPtr, {passive:true});
  cv.addEventListener('pointercancel', endPtr, {passive:true});

  cv.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const sx=e.clientX*DPR, sy=e.clientY*DPR;
    const factor = e.deltaY<0 ? ZOOM.step : (1/ZOOM.step);
    const nextScale = Math.max(ZOOM.min, Math.min(view.s*factor, ZOOM.max));
    const k = nextScale / view.s;
    view.cx += (sx - view.cx) - (sx - view.cx)*k;
    view.cy += (sy - view.cy) - (sy - view.cy)*k;
    view.s  = nextScale;
    draw();
  }, {passive:false});

  // тапы/клики
  cv.addEventListener('click', (e)=>{
    const sx=e.clientX*DPR, sy=e.clientY*DPR;
    const W=screenToWorld(sx,sy);

    if (mode===Mode.line){
      if (!firstPt){
        firstPt = snapToNodes(W);
        toast('Поставьте 2-ю точку');
        return;
      }
      const a=firstPt, b=snapToNodes(W);
      saveHistory();
      segs.push({a,b});
      firstPt=null;
      draw();
      return;
    }

    if (mode===Mode.erase){
      // удалить ближайший сегмент
      let bestI=-1, bestD=Infinity;
      const R = 16/DPR; // в мире
      for (let i=0;i<segs.length;i++){
        const s=segs[i];
        const A=s.a, B=s.b;
        const vx=B.x-A.x, vy=B.y-A.y, wx=W.x-A.x, wy=W.y-A.y;
        const c1=vx*wx+vy*wy; if(c1<=0){ var d=Math.hypot(W.x-A.x,W.y-A.y); }
        else{
          const c2=vx*vx+vy*vy;
          if (c2<=c1){ d=Math.hypot(W.x-B.x,W.y-B.y); }
          else{
            const t=c1/c2, px=A.x+t*vx, py=A.y+t*vy;
            d=Math.hypot(W.x-px,W.y-py);
          }
        }
        if (d<bestD){ bestD=d; bestI=i; }
      }
      if (bestI!==-1 && bestD<=R){
        saveHistory();
        segs.splice(bestI,1);
        draw();
      } else {
        toast('Нет линии рядом');
      }
      return;
    }

    if (mode===Mode.symbol){
      insertValveAtWorld(W);
      return;
    }

    // idle — ничего
  });

  // ---------- КНОПКИ / API ----------
  window.setMode = (m)=>{
    mode = (m==='line')?Mode.line : (m==='erase')?Mode.erase : (m==='symbol')?Mode.symbol : Mode.idle;
    firstPt=null;
    if (mode===Mode.line) toast('Режим Линия: поставьте 1-ю точку');
    if (mode===Mode.erase) toast('Ластик: тап по трубе');
    if (mode===Mode.symbol) toast('Символ: тап по трубе');
  };

  window.fitView = ()=>{
    view.s = Math.min(cv.width,cv.height)/900;
    view.s = Math.max(ZOOM.min, Math.min(ZOOM.max, view.s));
    view.cx = cv.width/2; view.cy = cv.height/2;
    draw();
  };

  window.undo = ()=>{
    const h=history.pop();
    if (!h){ toast('История пуста'); return; }
    segs.length=0; segs.push(...h.segs);
    symbols.length=0; symbols.push(...h.symbols);
    draw();
  };

  window.clearAll = ()=>{
    saveHistory();
    segs.length=0; symbols.length=0; firstPt=null; mode=Mode.idle;
    draw();
  };

  // ---------- СТАРТ ----------
  function boot(){
    resize();
    view.cx=cv.width/2; view.cy=cv.height/2; view.s=Math.min(cv.width,cv.height)/900;
    draw();
    toast('Готово. Выберите режим: Линия / Ластик / Символ.');
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();