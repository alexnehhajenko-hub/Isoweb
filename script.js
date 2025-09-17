(() => {
  // ---------- базовые переменные ----------
  const DPR = Math.min(2.5, Math.max(1, window.devicePixelRatio||1));
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d', {alpha:false});
  const toastEl = document.getElementById('toast');

  const state = {
    mode: 'idle',     // idle|line|valve|erase
    first: null,      // первая точка линии
    zoom: 1,          // масштаб мира -> экран
    cx: 0, cy: 0,     // смещение в экранных px
    segs: [],         // [{a:{x,y}, b:{x,y}}] в мировых координатах
    valves: []        // [{p:{x,y}, ang}] центр + угол (в мире)
  };

  // размеры и математика
  function resize(){
    const w = Math.floor(innerWidth * DPR);
    const h = Math.floor(innerHeight * DPR);
    if(cv.width!==w || cv.height!==h){ cv.width=w; cv.height=h; draw(); }
  }
  const worldToScreen = (x,y)=>({x: state.cx + x*state.zoom, y: state.cy + y*state.zoom});
  const screenToWorld = (sx,sy)=>({x: (sx - state.cx)/state.zoom, y:(sy - state.cy)/state.zoom});

  function show(msg,ms=900){ toastEl.textContent=msg; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),ms); }

  // ---------- сетка (лёгкая изометрия) ----------
  function drawGrid(){
    const step = 160*DPR, a = 0.14;
    ctx.save();
    const angs = [30,90,150];
    for(const A of angs){
      const r=A*Math.PI/180, vx=Math.cos(r), vy=Math.sin(r), px=-vy, py=vx;
      const need = Math.ceil(Math.max(cv.width,cv.height)/step)+2;
      for(let k=-need;k<=need;k++){
        const bx=px*k*step/state.zoom, by=py*k*step/state.zoom;
        const A1=worldToScreen(-vx*4e3+bx, -vy*4e3+by);
        const B1=worldToScreen( vx*4e3+bx,  vy*4e3+by);
        ctx.globalAlpha = (k%3===0)? a*1.3 : a;
        ctx.strokeStyle = (k%3===0)? '#25314a' : '#1a253e';
        ctx.lineWidth   = (k%3===0)? 1.6 : 1.0;
        ctx.beginPath(); ctx.moveTo(A1.x,A1.y); ctx.lineTo(B1.x,B1.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------- рисование сцены ----------
  function draw(){
    ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,cv.width,cv.height);
    drawGrid();

    // линии
    ctx.lineCap='round'; ctx.lineJoin='round';
    for(const s of state.segs){
      const A=worldToScreen(s.a.x,s.a.y), B=worldToScreen(s.b.x,s.b.y);
      ctx.strokeStyle='#4f5b78'; ctx.lineWidth=8*DPR; ctx.globalAlpha=.55;
      ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
      ctx.strokeStyle='#7b2cff'; ctx.lineWidth=6*DPR; ctx.globalAlpha=1;
      ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
    }

    // предпросмотр линии
    if(state.mode==='line' && state.first){
      const cur = lastPointer ? screenToWorld(lastPointer.x,lastPointer.y) : state.first;
      const A=worldToScreen(state.first.x,state.first.y), B=worldToScreen(cur.x,cur.y);
      ctx.setLineDash([10,8]); ctx.strokeStyle='#16a34a'; ctx.lineWidth=4*DPR;
      ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // вентили
    for(const v of state.valves){
      const L=18*DPR/state.zoom; // полудлина сегмента в мире
      const A = {x: v.p.x - Math.cos(v.ang)*L, y: v.p.y - Math.sin(v.ang)*L};
      const B = {x: v.p.x + Math.cos(v.ang)*L, y: v.p.y + Math.sin(v.ang)*L};
      drawValveSymbol(ctx, worldToScreen(A.x,A.y), worldToScreen(B.x,B.y), DPR);
    }
  }

  // ---------- режимы ----------
  function setMode(m){
    state.mode=m;
    state.first=null;
    const text = m==='line'  ? 'Линия: тапни 2 точки'
               : m==='valve' ? 'Вентиль: тап по трубе (один)'
               : m==='erase' ? 'Ластик: тап по объекту'
               : 'Готово';
    show(text);
    draw();
  }

  // ---------- поиск ближайшей линии ----------
  function nearestSegmentAt(sx,sy){
    let bestIndex=-1, bestD=Infinity, bestT=0, bestP=null, ang=0;
    for(let i=0;i<state.segs.length;i++){
      const s=state.segs[i];
      const A=worldToScreen(s.a.x,s.a.y), B=worldToScreen(s.b.x,s.b.y);
      const vx=B.x-A.x, vy=B.y-A.y, wx=sx-A.x, wy=sy-A.y;
      const c1=vx*wx+vy*wy, c2=vx*vx+vy*vy;
      const t=Math.max(0,Math.min(1,c1/(c2||1)));
      const px=A.x+t*vx, py=A.y+t*vy;
      const d=Math.hypot(px-sx,py-sy);
      if(d<bestD){ bestD=d; bestIndex=i; bestT=t; bestP={x:px,y:py}; ang=Math.atan2(vy,vx); }
    }
    return {index:bestIndex, dist:bestD, t:bestT, p:bestP, ang};
  }

  // ---------- ввод/жесты ----------
  let pointers=new Map(), lastPointer=null, panStart=null;

  cv.addEventListener('pointerdown', e=>{
    cv.setPointerCapture?.(e.pointerId);
    const p={x:e.clientX*DPR, y:e.clientY*DPR}; pointers.set(e.pointerId,p);
    lastPointer=p;
    if(pointers.size===1){ panStart={x:p.x,y:p.y, cx:state.cx, cy:state.cy}; }

    if(state.mode==='line'){
      const w=screenToWorld(p.x,p.y);
      if(!state.first){ state.first=w; draw(); }
      else{
        // «один выстрел»: сохранить сегмент и выйти в idle
        state.segs.push({a:state.first, b:w});
        state.first=null; setMode('idle'); draw();
      }
    }else if(state.mode==='valve'){
      // один тап по трубе: вставим вентиль, выстрел-один
      const near=nearestSegmentAt(p.x,p.y);
      if(near.index!==-1 && near.dist<=26*DPR){
        const W=screenToWorld(near.p.x,near.p.y);
        state.valves.push({p:W, ang:near.ang});
        setMode('idle'); draw();
      }else show('Тапни ближе к трубе');
    }else if(state.mode==='erase'){
      const near=nearestSegmentAt(p.x,p.y);
      // удалим вентиль, если ближе к нему
      let best='none', bi=-1, bd=Infinity;
      for(let i=0;i<state.valves.length;i++){
        const v=state.valves[i], S=worldToScreen(v.p.x,v.p.y);
        const d=Math.hypot(S.x-p.x,S.y-p.y);
        if(d<bd){ bd=d; best='valve'; bi=i; }
      }
      if(near.dist < bd && near.dist<=24*DPR){ state.segs.splice(near.index,1); show('Удалено: линия'); }
      else if(bd<=24*DPR){ state.valves.splice(bi,1); show('Удалено: вентиль'); }
      else show('Нет объектов');
      draw();
    }
  }, {passive:true});

  cv.addEventListener('pointermove', e=>{
    if(!pointers.has(e.pointerId)) return;
    const cur={x:e.clientX*DPR, y:e.clientY*DPR};
    pointers.set(e.pointerId,cur); lastPointer=cur;

    // панорамирование одним пальцем (только вне рисования)
    if(state.mode==='idle' && panStart && pointers.size===1){
      state.cx = panStart.cx + (cur.x - panStart.x);
      state.cy = panStart.cy + (cur.y - panStart.y);
      draw();
    }

    // pinch-zoom
    if(pointers.size===2){
      const ids=[...pointers.keys()];
      const a=pointers.get(ids[0]), b=pointers.get(ids[1]);
      const ap={...a._prev||a}, bp={...b._prev||b};
      a._prev={...a}; b._prev={...b};
      const dPrev=Math.hypot(ap.x-bp.x, ap.y-bp.y);
      const dCur =Math.hypot(a.x-b.x, a.y-b.y);
      if(dPrev>0){
        const f=Math.max(0.65, Math.min(1.55, dCur/dPrev));
        const c={x:(a.x+b.x)/2, y:(a.y+b.y)/2};
        // «умный» зум вокруг центра pinch
        state.cx = c.x - (c.x - state.cx)*f;
        state.cy = c.y - (c.y - state.cy)*f;
        state.zoom = Math.max(0.35*DPR, Math.min(state.zoom*f, 8*DPR));
        draw();
      }
    }
  }, {passive:true});

  function endPtr(e){ pointers.delete(e.pointerId); lastPointer=null; if(pointers.size===0) panStart=null; }
  cv.addEventListener('pointerup', endPtr, {passive:true});
  cv.addEventListener('pointercancel', endPtr, {passive:true});

  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const sx=e.clientX*DPR, sy=e.clientY*DPR;
    const f = e.deltaY<0 ? 1.12 : 0.9;
    state.cx = sx - (sx - state.cx)*f;
    state.cy = sy - (sy - state.cy)*f;
    state.zoom = Math.max(0.35*DPR, Math.min(state.zoom*f, 8*DPR));
    draw();
  }, {passive:false});

  // ---------- кнопки ----------
  document.getElementById('bLine').onclick  = ()=> setMode('line');   // «один выстрел»
  document.getElementById('bValve').onclick = ()=> setMode('valve');  // «один выстрел»
  document.getElementById('bErase').onclick = ()=> setMode('erase');
  document.getElementById('bFit').onclick   = ()=>{ state.cx=cv.width/2; state.cy=cv.height/2; state.zoom=1*DPR; draw(); };
  document.getElementById('bUndo').onclick  = ()=>{
    if(state.valves.length) state.valves.pop();
    else if(state.segs.length) state.segs.pop();
    else state.first=null;
    draw();
  };
  document.getElementById('bClear').onclick = ()=>{ state.segs.length=0; state.valves.length=0; state.first=null; draw(); };

  // ---------- старт ----------
  function boot(){
    resize();
    state.cx=cv.width/2; state.cy=cv.height/2; state.zoom=1*DPR;
    setMode('idle');
    show('Готово');
  }
  window.addEventListener('resize', resize);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();