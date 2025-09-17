// script.js
(function(){
  // ---------- базовые вещи ----------
  const cv  = document.getElementById('cv');
  const ctx = cv.getContext('2d', {alpha:false});
  const toastEl = document.getElementById('toast');
  const DPR = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));

  const state = {
    mode: 'idle',                // idle | line | erase | valve
    firstPt: null,               // первая точка для линии/вентиля
    segs: [],                    // [{a:{x,y}, b:{x,y}}]
    valves: [],                  // [{a:{x,y}, b:{x,y}}]
    gridOn: true,

    // "камера" (виртуальный мир -> экран)
    s: 1 * DPR,                  // масштаб
    cx: 0, cy: 0,                // сдвиг в пикселях экрана

    // жесты
    pointers: new Map(),
    lastPan: null
  };

  function showToast(t, ms=900){
    toastEl.textContent = t; toastEl.classList.add('show');
    setTimeout(()=>toastEl.classList.remove('show'), ms);
  }

  // ---------- размеры ----------
  function resize(){
    const w = Math.floor(innerWidth  * DPR);
    const h = Math.floor(innerHeight * DPR);
    if(cv.width !== w || cv.height !== h){
      cv.width = w; cv.height = h;
      fitCanvas();
      draw();
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', ()=>setTimeout(resize,100), {passive:true});

  // ---------- мировые <-> экранные ----------
  const scrToWorld = (sx,sy)=>({ x:(sx - state.cx)/state.s, y:(sy - state.cy)/state.s });
  const worldToScr = (x,y)=>({ x: state.cx + x*state.s, y: state.cy + y*state.s });

  // ---------- сетка (изометрическая) ----------
  const grid = { step: 200, angle: 30, alpha: 0.15 };
  function drawGrid(){
    if(!state.gridOn) return;
    const base=[grid.angle, 90, 180-grid.angle];

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for(const ang of base){
      const r=ang*Math.PI/180, vx=Math.cos(r), vy=Math.sin(r), px=-vy, py=vx;
      const stepScr=grid.step*state.s;
      const need=Math.ceil(Math.max(cv.width,cv.height)/stepScr)+3;
      for(let k=-need;k<=need;k++){
        const bx=px*k*grid.step, by=py*k*grid.step;
        const A=worldToScr(bx - vx*20000, by - vy*20000);
        const B=worldToScr(bx + vx*20000, by + vy*20000);
        ctx.globalAlpha = (k%3===0)? grid.alpha*1.35 : grid.alpha;
        ctx.strokeStyle = (k%3===0)? '#b7bcc8' : '#cfd3dc';
        ctx.lineWidth   = (k%3===0)? 1.4 : 1.0;
        ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // ---------- рисование сцены ----------
  function draw(){
    // фон
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);

    // сетка (в экранных координатах)
    drawGrid();

    // включаем мировой трансформ
    ctx.save();
    ctx.translate(state.cx, state.cy);
    ctx.scale(state.s, state.s);

    // трубы (линии)
    ctx.lineCap='round'; ctx.lineJoin='round';
    for(const s of state.segs){
      ctx.strokeStyle='#7b2cff'; ctx.lineWidth=8*DPR/state.s;
      ctx.globalAlpha=1;
      ctx.beginPath(); ctx.moveTo(s.a.x,s.a.y); ctx.lineTo(s.b.x,s.b.y); ctx.stroke();
      ctx.strokeStyle='#4a21a8'; ctx.lineWidth=1.2*DPR/state.s;
      ctx.globalAlpha=.65;
      ctx.beginPath(); ctx.moveTo(s.a.x,s.a.y); ctx.lineTo(s.b.x,s.b.y); ctx.stroke();
      ctx.globalAlpha=1;
    }

    // вентили
    for(const v of state.valves){
      drawValve(ctx, v.a, v.b, DPR/state.s);
    }

    // предпросмотр второй точки
    if(state.firstPt && (state.mode==='line' || state.mode==='valve')){
      const p=state.firstPt;
      ctx.fillStyle='#16a34a'; ctx.strokeStyle='#fff'; ctx.lineWidth=2/state.s;
      ctx.beginPath(); ctx.arc(p.x,p.y,8/state.s,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }

    ctx.restore();
  }

  // ---------- снапы (точки и углы 0/60/120) ----------
  function allNodes(){ const a=[]; for(const s of state.segs){ a.push(s.a,s.b); } for(const v of state.valves){ a.push(v.a,v.b);} return a; }
  function snapToNodes(pt, radiusPx=20){
    const sx=state.cx+pt.x*state.s, sy=state.cy+pt.y*state.s;
    let best=null, bestD=Infinity, R=radiusPx*DPR;
    for(const n of allNodes()){
      const ns=worldToScr(n.x,n.y); const d=Math.hypot(ns.x-sx,ns.y-sy);
      if(d<bestD && d<=R){ best=n; bestD=d;}
    }
    return best? {x:best.x,y:best.y} : pt;
  }
  const normDeg=a=>((a%360)+360)%360;
  const angDiff=(a,b)=>{ let d=Math.abs(a-b)%360; return d>180?360-d:d; };
  function snapIsoFrom(start, end, tolDeg=10){
    const v={x:end.x-start.x, y:end.y-start.y}; const L=Math.hypot(v.x,v.y);
    if(L===0) return end;
    const base=[grid.angle, 90, 180-grid.angle];
    const targets=[...base, base[0]+180, base[1]+180, base[2]+180];
    const ang=normDeg(Math.atan2(v.y,v.x)*180/Math.PI);
    let best=ang, bestD=181;
    for(const t of targets){ const d=angDiff(ang,normDeg(t)); if(d<bestD){bestD=d; best=t;} }
    if(bestD>tolDeg) return end;
    const a=best*Math.PI/180;
    return { x:start.x+Math.cos(a)*L, y:start.y+Math.sin(a)*L };
  }
  function snapPoint(startOrNull, raw){
    let p=snapToNodes(raw);
    if(startOrNull) p=snapIsoFrom(startOrNull,p);
    return p;
  }

  // ---------- добавление объектов ----------
  function addLine(a,b){ state.segs.push({a:{...a}, b:{...b}}); }
  function addValve(a,b){ state.valves.push({a:{...a}, b:{...b}}); }

  // ---------- "фит" ----------
  function fitCanvas(){
    state.s  = 1*DPR;
    state.cx = cv.width/2;
    state.cy = cv.height/2;
  }

  // ---------- выбор ближайшего для ластика ----------
  function findNearestObject(scrX, scrY){
    // ищем ближайший сегмент/вентиль
    let best = {kind:null, idx:-1, dist:Infinity};

    function distToSeg(s){
      const A=worldToScr(s.a.x,s.a.y), B=worldToScr(s.b.x,s.b.y);
      const vx=B.x-A.x, vy=B.y-A.y;
      const c1=(scrX-A.x)*vx + (scrY-A.y)*vy;
      if(c1<=0) return Math.hypot(scrX-A.x, scrY-A.y);
      const c2=vx*vx+vy*vy;
      if(c2<=c1) return Math.hypot(scrX-B.x, scrY-B.y);
      const t=c1/c2, px=A.x+t*vx, py=A.y+t*vy;
      return Math.hypot(scrX-px, scrY-py);
    }

    state.segs.forEach((s,i)=>{
      const d=distToSeg(s);
      if(d<best.dist){ best={kind:'seg', idx:i, dist:d}; }
    });
    state.valves.forEach((v,i)=>{
      const d=distToSeg(v);
      if(d<best.dist){ best={kind:'valve', idx:i, dist:d}; }
    });

    return best;
  }

  // ---------- жесты / указатели ----------
  cv.addEventListener('pointerdown', (e)=>{
    cv.setPointerCapture?.(e.pointerId);
    const p={x:e.clientX*DPR, y:e.clientY*DPR};
    state.pointers.set(e.pointerId, p);

    if(state.pointers.size===1){
      // одиночный палец/мышь — режимный клик
      const w=scrToWorld(p.x,p.y);

      if(state.mode==='line'){
        if(!state.firstPt){ state.firstPt = snapToNodes(w); showToast('Поставь вторую точку'); }
        else{ const end=snapPoint(state.firstPt, w); addLine(state.firstPt, end); state.firstPt=null; draw(); }
      }
      else if(state.mode==='valve'){
        if(!state.firstPt){
          state.firstPt = snapToNodes(w);
          showToast('Вторая точка — ориентация (длина фикс.)');
        }else{
          const dir = snapPoint(state.firstPt, w);
          // фиксированная видимая длина вентиля ~ 60 экранных px => в мир
          const Lpx = 60 * DPR;
          const ax = state.firstPt.x, ay = state.firstPt.y;
          const vx = dir.x-ax, vy = dir.y-ay;
          const len = Math.hypot(vx,vy) || 1;
          const ux = vx/len, uy = vy/len;
          const Lworld = Lpx / state.s;
          const bx = ax + ux*Lworld, by = ay + uy*Lworld;
          addValve(state.firstPt, {x:bx,y:by});
          state.firstPt=null; draw();
        }
      }
      else if(state.mode==='erase'){
        // удалить ближайшее
        const hit=findNearestObject(p.x,p.y);
        const R=18*DPR;
        if(hit.kind && hit.dist<=R){
          if(hit.kind==='seg')   state.segs.splice(hit.idx,1);
          if(hit.kind==='valve') state.valves.splice(hit.idx,1);
          draw();
        }else{
          showToast('Нет объектов рядом');
        }
      }
      else{
        // idle — можно перетаскивать одним пальцем (пан)
        state.lastPan = p;
      }
    }
    if(state.pointers.size===2){
      // запоминаем исходное состояние для пинча
      const ids=[...state.pointers.keys()];
      const a=state.pointers.get(ids[0]), b=state.pointers.get(ids[1]);
      state._pinch = {
        d0: Math.hypot(a.x-b.x, a.y-b.y),
        c0: { x:(a.x+b.x)/2, y:(a.y+b.y)/2 },
        s0: state.s, cx0: state.cx, cy0: state.cy
      };
    }
  }, {passive:true});

  cv.addEventListener('pointermove', (e)=>{
    if(!state.pointers.has(e.pointerId)) return;
    const cur={x:e.clientX*DPR, y:e.clientY*DPR};
    const prev=state.pointers.get(e.pointerId); state.pointers.set(e.pointerId,cur);

    if(state.pointers.size===1 && state.mode==='idle' && state.lastPan){
      state.cx += (cur.x - state.lastPan.x);
      state.cy += (cur.y - state.lastPan.y);
      state.lastPan = cur;
      draw();
    }
    if(state.pointers.size===2 && state._pinch){
      const ids=[...state.pointers.keys()];
      const a=state.pointers.get(ids[0]), b=state.pointers.get(ids[1]);
      const d = Math.hypot(a.x-b.x, a.y-b.y);
      if(d>0){
        const f = d / state._pinch.d0;
        const c = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
        // масштаб вокруг центра пинча
        state.s = Math.max(0.3*DPR, Math.min(5*DPR, state._pinch.s0 * f));
        const dx = c.x - state._pinch.c0.x;
        const dy = c.y - state._pinch.c0.y;
        state.cx = state._pinch.cx0 + dx;
        state.cy = state._pinch.cy0 + dy;
        draw();
      }
    }
  }, {passive:true});

  function endPtr(e){
    state.pointers.delete(e.pointerId);
    if(state.pointers.size!==1) state.lastPan=null;
    if(state.pointers.size<2) state._pinch=null;
  }
  cv.addEventListener('pointerup',   endPtr, {passive:true});
  cv.addEventListener('pointercancel',endPtr, {passive:true});
  cv.addEventListener('pointerleave', endPtr, {passive:true});

  // колесо мыши (зум к курсору)
  cv.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const sx=e.clientX*DPR, sy=e.clientY*DPR;
    const before = scrToWorld(sx,sy);
    const f = (e.deltaY<0)? 1.12 : 0.9;
    state.s = Math.max(0.3*DPR, Math.min(5*DPR, state.s * f));
    const after = worldToScr(before.x,before.y);
    state.cx += (sx - after.x);
    state.cy += (sy - after.y);
    draw();
  }, {passive:false});

  // ---------- тулбар ----------
  document.getElementById('toolbar').addEventListener('click', (e)=>{
    const act = e.target?.dataset?.act; if(!act) return;

    if(act==='line'){  state.mode='line';  state.firstPt=null; showToast('Линия: 1-я точка → 2-я точка'); }
    if(act==='erase'){ state.mode='erase'; state.firstPt=null; showToast('Ластик: тап рядом с объектом'); }
    if(act==='valve'){ state.mode='valve'; state.firstPt=null; showToast('Вентиль: 1-я точка → ориентация'); }
    if(act==='fit'){   fitCanvas(); draw(); }
    if(act==='undo'){
      if(state.firstPt) state.firstPt=null;
      else if(state.valves.length) state.valves.pop();
      else if(state.segs.length)   state.segs.pop();
      draw();
    }
    if(act==='clear'){ state.firstPt=null; state.segs.length=0; state.valves.length=0; draw(); }
    if(act==='grid'){  state.gridOn=!state.gridOn; draw(); }
  });

  // ---------- запуск ----------
  function boot(){
    resize();
    // камера в центр
    state.cx = cv.width/2; state.cy = cv.height/2; state.s = 1*DPR;
    draw();
    showToast('Готово: Линия/Вентиль/Ластик, пинч-зум, перетаскивание.');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();