(function(){
  // ---------- базовые утилиты ----------
  const DPR = Math.min(1.5, Math.max(1, (window.devicePixelRatio||1)));
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d', { alpha:false });
  const $ = id => document.getElementById(id);
  const toast = (t,ms=1200)=>{ const el=$('toast'); el.textContent=t; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),ms); };

  // ---------- состояние ----------
  let mode='hand'; // hand | line | edit | place
  let panelOpen=false;
  const canvasFrozen = ()=>panelOpen;

  const segs = [];                  // {a:{x,y}, b:{x,y}}
  const items = [];                 // элементы на линиях: {type, segIndex, t}
  const pts  = { show:true, sizePx:10 };
  const snap = { on:true, isoTolDeg:10, radiusPx:18, endStickPx:28, finalLimitPx:6 };
  let lineWidthPx = 6;
  let pxPerMm = 6;                  // масштаб для «10 мм» корпусов

  // правка конца
  const EDIT_HOLD_MS = 450;
  let holdTimer=null, editing=null; // {segIndex, end:'a'|'b'}

  // инструмент линии
  let firstPt=null, previewPt=null, axisLock={active:false,angle:null};

  // выбор элемента
  let placeType=null;

  // указатели
  const pointers=new Map();
  let last1=null;

  // offscreen слой линий
  const linesCv=document.createElement('canvas');
  const linesCtx=linesCv.getContext('2d',{alpha:true});

  // индикатор угла
  const angleTag = $('angleTag');
  const showAngleTag=(x,y,deg)=>{ angleTag.style.display='block'; angleTag.style.left=x+'px'; angleTag.style.top=y+'px'; angleTag.textContent=Math.round(deg)+'°'; };
  const hideAngleTag=()=>{ angleTag.style.display='none'; };

  // ---------- размеры / канвас ----------
  function fit(){
    cv.width=Math.floor(innerWidth*DPR);
    cv.height=Math.floor(innerHeight*DPR);
    linesCv.width=cv.width; linesCv.height=cv.height;
    draw();
  }
  addEventListener('resize',fit);

  function getCanvasPoint(e){
    const r=cv.getBoundingClientRect();
    return { sx:(e.clientX-r.left)*DPR, sy:(e.clientY-r.top)*DPR };
  }
  const worldToScreen=(x,y)=>({x,y});
  const screenToWorld=(sx,sy)=>({x:sx,y:sy});

  // ---------- снап ----------
  function allNodes(){ const arr=[]; for(const s of segs){ arr.push(s.a,s.b); } if(firstPt) arr.push(firstPt); return arr; }

  function snapToNodes(raw){
    if(!snap.on) return raw;
    const R=snap.radiusPx*DPR, Rx=snap.endStickPx*DPR;
    let best=null, bestD=Infinity;
    for(const n of allNodes()){
      const d=Math.hypot(n.x-raw.x, n.y-raw.y);
      const thr=(d<Rx?Rx:R);
      if(d<thr && d<bestD){ bestD=d; best=n; }
    }
    return best? {x:best.x,y:best.y, _lockNode:true}: raw;
  }

  function snapToSegmentExtension(raw, tolPx=10){
    if(!snap.on || segs.length===0) return raw;
    let best=null, bestD=Infinity;
    for(const s of segs){
      const A=s.a, B=s.b;
      const vx=B.x-A.x, vy=B.y-A.y, L=Math.hypot(vx,vy); if(L<1) continue;
      const nx=vx/L, ny=vy/L;
      const wx=raw.x-A.x, wy=raw.y-A.y;
      const proj=wx*nx+wy*ny;
      const px=A.x+nx*proj, py=A.y+ny*proj;
      const d=Math.hypot(raw.x-px, raw.y-py);
      if(d<=tolPx*DPR && d<bestD){ bestD=d; best={x:px,y:py}; }
    }
    if(best){ best._lockAxis=true; return best; }
    return raw;
  }

  const normDeg=a=>((a%360)+360)%360;
  const angDiff=(a,b)=>{ let d=Math.abs(a-b)%360; return d>180?360-d:d; };
  function adaptiveTol(start,end){
    const L=Math.hypot(end.x-start.x, end.y-start.y);
    const px=L/DPR; const t=snap.isoTolDeg;
    if(px<40) return t+8; if(px<120) return t+4; if(px<240) return t; return Math.max(4,t-3);
  }
  const lockTargets=[0,90,180,-90,30,150,210,330];
  function snapToAxes(raw,start,tolDeg){
    if(!snap.on || !start) return raw;
    const v={x:raw.x-start.x,y:raw.y-start.y}, L=Math.hypot(v.x,v.y);
    if(L===0) return raw;
    const ang=normDeg(Math.atan2(v.y,v.x)*180/Math.PI);
    let bestA=axisLock.active?axisLock.angle:null, bestD=axisLock.active?angDiff(ang,bestA):181;

    if(!axisLock.active){
      for(const t of lockTargets){ const d=angDiff(ang,normDeg(t)); if(d<bestD){bestD=d; bestA=t;} }
      if(bestD<=tolDeg){ axisLock.active=true; axisLock.angle=bestA; }
    }else{
      if(bestD>tolDeg+8){ axisLock.active=false; axisLock.angle=null; return raw; }
      bestA=axisLock.angle;
    }
    if(axisLock.active && bestA!=null){
      const a=bestA*Math.PI/180;
      const snapped={ x:start.x+Math.cos(a)*L, y:start.y+Math.sin(a)*L, _lockAxis:true, _deg:bestA };
      return snapped;
    }
    return raw;
  }
  function clearAxis(){ axisLock.active=false; axisLock.angle=null; }
  function previewWithSnap(raw,start){
    let p=snapToNodes(raw);
    const ext=snapToSegmentExtension(p,10); if(ext._lockAxis){ axisLock.active=true; return ext; } p=ext;
    return snapToAxes(p,start,adaptiveTol(start,p));
  }
  function limitFinal(rawEnd, snappedEnd){
    if(!snap.on) return snappedEnd;
    const dist=Math.hypot(rawEnd.x-snappedEnd.x, rawEnd.y-snappedEnd.y)/DPR;
    return dist<=snap.finalLimitPx ? snappedEnd : rawEnd;
  }
  function finalizeWithSnap(start,endRaw){
    const merged=snapToNodes(endRaw);
    const axis=snapToAxes( snapToSegmentExtension(merged,10), start, Math.max(12, snap.isoTolDeg) );
    return limitFinal(endRaw,axis);
  }

  // ---------- рендер ----------
  function draw(){
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);

    // линии
    linesCtx.clearRect(0,0,linesCv.width,linesCv.height);
    linesCtx.lineCap='round'; linesCtx.lineJoin='round';
    for(const s of segs){
      linesCtx.strokeStyle='#5b00bf'; linesCtx.lineWidth=lineWidthPx+2; linesCtx.globalAlpha=.7;
      linesCtx.beginPath(); linesCtx.moveTo(s.a.x,s.a.y); linesCtx.lineTo(s.b.x,s.b.y); linesCtx.stroke();
      linesCtx.strokeStyle='#7b2cff'; linesCtx.lineWidth=lineWidthPx; linesCtx.globalAlpha=1;
      linesCtx.beginPath(); linesCtx.moveTo(s.a.x,s.a.y); linesCtx.lineTo(s.b.x,s.b.y); linesCtx.stroke();
    }

    // элементы (врезки на линии)
    ctx.save(); ctx.lineWidth=1; ctx.strokeStyle='#111'; ctx.fillStyle='#111';
    items.forEach(it=>{
      const s=segs[it.segIndex]; if(!s) return;
      const ax=s.a.x, ay=s.a.y, bx=s.b.x, by=s.b.y;
      const vx=bx-ax, vy=by-ay; const L=Math.hypot(vx,vy); if(L<1) return;
      const nx=vx/L, ny=vy/L;
      const px=ax+nx*L*it.t, py=ay+ny*L*it.t;
      const angle=Math.atan2(vy,vx);
      const orientation = (Math.abs(Math.sin(angle))<0.45)? 'top' : 'front'; // горизонт≈ручка сверху, вертикаль≈«в лицо»
      ctx.save(); ctx.translate(px,py); ctx.rotate(angle);
      window.ValveLib.draw(it.type, ctx, pxPerMm, orientation);
      ctx.restore();
    });
    ctx.restore();

    // точки
    if(pts.show){
      const size=pts.sizePx*DPR;
      const dot=p=>{
        ctx.beginPath(); ctx.fillStyle='rgba(123,44,255,.33)'; ctx.arc(p.x,p.y,size*.9,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle='#7b2cff'; ctx.arc(p.x,p.y,size*.65,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle='#fff'; ctx.arc(p.x,p.y,size*.28,0,Math.PI*2); ctx.fill();
      };
      for(const s of segs){ dot(s.a); dot(s.b); }
      if(firstPt) dot(firstPt);
      if(previewPt){ ctx.beginPath(); ctx.fillStyle='#16a34a'; ctx.arc(previewPt.x,previewPt.y,size*.5,0,Math.PI*2); ctx.fill(); }
    }

    // превью сегмента
    if(firstPt && previewPt){
      ctx.save(); ctx.setLineDash([8,8]); ctx.strokeStyle='#16a34a'; ctx.lineWidth=Math.max(3,lineWidthPx-2);
      ctx.beginPath(); ctx.moveTo(firstPt.x,firstPt.y); ctx.lineTo(previewPt.x,previewPt.y); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }

    ctx.drawImage(linesCv,0,0);
  }

  // ближайший сегмент и параметр t (0..1)
  function nearestSegmentParam(raw){
    let best=null, bestD=Infinity, idx=-1;
    for(let i=0;i<segs.length;i++){
      const s=segs[i], A=s.a, B=s.b;
      const vx=B.x-A.x, vy=B.y-A.y, L=Math.hypot(vx,vy); if(L<1) continue;
      const nx=vx/L, ny=vy/L;
      const wx=raw.x-A.x, wy=raw.y-A.y;
      let proj=wx*nx+wy*ny; proj=Math.max(0,Math.min(L,proj));
      const px=A.x+nx*proj, py=A.y+ny*proj;
      const d=Math.hypot(raw.x-px,raw.y-py);
      if(d<bestD){ bestD=d; best={t:(L?proj/L:0), px,py}; idx=i; }
    }
    return (idx>=0)?{segIndex:idx, ...best}:null;
  }

  // ---------- жесты ----------
  cv.addEventListener('pointerdown', e=>{
    if(canvasFrozen()) return;
    e.preventDefault();
    cv.setPointerCapture?.(e.pointerId);
    const {sx,sy}=getCanvasPoint(e);
    const p={x:sx,y:sy}; pointers.set(e.pointerId,p);
    if(pointers.size===1) last1=p;

    clearTimeout(holdTimer);
    holdTimer=setTimeout(()=>{
      if(mode!=='line'){
        const hit=findEndpointNear(p.x,p.y,18);
        if(hit){ mode='edit'; editing=hit; toast('Правка конца: потяни'); }
      }
    }, EDIT_HOLD_MS);

    if(mode==='line' && firstPt){
      const w=screenToWorld(p.x,p.y);
      const pr=previewWithSnap(w,firstPt);
      previewPt=pr;
      if(pr._deg!=null){ showAngleTag(pr.x/DPR, pr.y/DPR, pr._deg); }
      draw();
    }
  }, {passive:false});

  cv.addEventListener('pointermove', e=>{
    if(canvasFrozen()) return;
    e.preventDefault();
    if(!pointers.has(e.pointerId)) return;
    const {sx,sy}=getCanvasPoint(e);
    const cur={x:sx,y:sy};
    pointers.set(e.pointerId,cur);

    if(mode==='edit' && editing){
      const s=segs[editing.segIndex];
      const start=(editing.end==='a')? s.b : s.a;
      let w=screenToWorld(cur.x,cur.y);
      w=previewWithSnap(w,start);
      if(editing.end==='a') s.a=w; else s.b=w;
      if(w._deg!=null){ showAngleTag(w.x/DPR,w.y/DPR,w._deg); }
      draw();
    }

    if(mode==='line' && firstPt){
      let w=screenToWorld(cur.x,cur.y);
      w=previewWithSnap(w,firstPt);
      previewPt=w;
      if(w._deg!=null){ showAngleTag(w.x/DPR,w.y/DPR,w._deg); } else hideAngleTag();
      draw();
    }
  }, {passive:false});

  function endPointers(e){ pointers.delete(e.pointerId); last1=(pointers.size===1)?[...pointers.values()][0]:null; }

  cv.addEventListener('pointerup', e=>{
    if(canvasFrozen()) return;
    e.preventDefault();
    endPointers(e);
    clearTimeout(holdTimer);
    hideAngleTag();

    if(mode==='edit' && editing){
      const s=segs[editing.segIndex];
      const start=(editing.end==='a')? s.b : s.a;
      const end  =(editing.end==='a')? s.a : s.b;
      const fixed=finalizeWithSnap(start,end);
      if(editing.end==='a') s.a=fixed; else s.b=fixed;
      mode='hand'; editing=null; clearAxis(); draw(); return;
    }

    // постановка элемента на ближайший сегмент
    if(mode==='place' && placeType){
      if(!segs.length){ toast('Сначала нарисуй линию'); return; }
      const {sx,sy}=getCanvasPoint(e); const raw=screenToWorld(sx,sy);
      const near=nearestSegmentParam(raw);
      if(near){ items.push({type:placeType, segIndex:near.segIndex, t:near.t}); draw(); }
      return;
    }

    if(mode==='line'){
      const {sx,sy}=getCanvasPoint(e);
      const raw=screenToWorld(sx,sy);
      if(!firstPt){
        firstPt = snapToNodes(raw);
        previewPt=null; clearAxis(); draw(); return;
      }
      const proposed = finalizeWithSnap(firstPt, (previewPt||raw));
      segs.push({a:firstPt,b:proposed});
      firstPt=null; previewPt=null; mode='hand'; clearAxis(); draw(); return;
    }
  }, {passive:false});

  // правка: поиск конца
  function findEndpointNear(sx,sy,r=18){
    const R=r*DPR; let best=null,bestD=Infinity;
    for(let i=0;i<segs.length;i++){
      const s=segs[i];
      const dA=Math.hypot(s.a.x-sx,s.a.y-sy);
      const dB=Math.hypot(s.b.x-sx,s.b.y-sy);
      if(dA<bestD && dA<=R){best={segIndex:i,end:'a'};bestD=dA;}
      if(dB<bestD && dB<=R){best={segIndex:i,end:'b'};bestD=dB;}
    }
    return best;
  }

  // ---------- кнопки ----------
  function setActive(idArr){
    // подсветка текущих инструментов
    const all=['btnHand','btnLine','btnGate','btnGlobe','btnCheck','btnBall','btnPump'];
    all.forEach(id=>$(id).classList.toggle('active', idArr.includes(id)));
  }

  $('btnHand').onclick = ()=>{ mode='hand'; placeType=null; firstPt=null; previewPt=null; hideAngleTag(); setActive(['btnHand']); toast('Рука'); };
  $('btnFit').onclick  = ()=>{ toast('Фит'); };
  $('btnLine').onclick = ()=>{ mode='line'; placeType=null; firstPt=null; previewPt=null; hideAngleTag(); setActive(['btnLine']); toast('Линия: поставь 2 точки'); };
  $('btnUndo').onclick = ()=>{ if(firstPt && mode==='line'){ firstPt=null; previewPt=null; mode='hand'; } else if(segs.length){ segs.pop(); } draw(); };
  $('btnExport').onclick=()=>{ const url=cv.toDataURL('image/png',0.95); const a=document.createElement('a'); a.href=url; a.download='IsoPipe.png'; a.click(); };

  // выбор типа элемента
  function startPlace(type, btnId){
    mode='place'; placeType=type; setActive([btnId]); toast('Тапни по трубе для установки');
  }
  $('btnGate').onclick  = ()=>startPlace('gate','btnGate');
  $('btnGlobe').onclick = ()=>startPlace('globe','btnGlobe');
  $('btnCheck').onclick = ()=>startPlace('check','btnCheck');
  $('btnBall').onclick  = ()=>startPlace('ball','btnBall');
  $('btnPump').onclick  = ()=>startPlace('pump','btnPump');

  // ---------- панель ----------
  const wrap=$('panelWrap'), panel=$('panel'), backdrop=$('panelBackdrop');
  let lastFocus=null;
  const openPanel=()=>{ lastFocus=document.activeElement; panelOpen=true; wrap.classList.add('open'); wrap.setAttribute('aria-hidden','false'); cv.style.pointerEvents='none'; document.body.style.overflow='hidden'; panel.focus(); };
  const closePanel=()=>{ panelOpen=false; wrap.classList.remove('open'); wrap.setAttribute('aria-hidden','true'); cv.style.pointerEvents='auto'; document.body.style.overflow=''; (lastFocus||$('btnSettings')).focus(); };
  $('btnSettings').onclick=openPanel; $('btnDone').onclick=closePanel; backdrop.onclick=closePanel; addEventListener('keydown', e=>{ if(panelOpen && e.key==='Escape') closePanel(); });
  ['pointerdown','pointermove','pointerup','touchstart','touchmove','touchend','mousedown','mousemove','mouseup','wheel','click'].forEach(ev=>{
    panel.addEventListener(ev, ev2=>ev2.stopPropagation(), {passive:false});
  });

  // настройки
  $('snapOn').onchange    = e=>{ snap.on=!!e.target.checked; clearAxis(); };
  $('snapRadius').oninput = e=>{ snap.radiusPx=+e.target.value||18; $('snapRadiusVal').textContent=e.target.value; };
  $('isoTol').oninput     = e=>{ snap.isoTolDeg=+e.target.value||10; $('isoTolVal').textContent=e.target.value; };
  $('endStick').oninput   = e=>{ snap.endStickPx=+e.target.value||28; $('endStickVal').textContent=e.target.value; };
  $('finalSnapLimit').oninput = e=>{ snap.finalLimitPx=+e.target.value||6; $('finalSnapLimitVal').textContent=e.target.value; };

  $('lineWidth').oninput  = e=>{ lineWidthPx=+e.target.value||6; $('lineWidthVal').textContent=lineWidthPx; draw(); };
  $('showPoints').onchange= e=>{ pts.show=!!e.target.checked; draw(); };
  $('ptSize').oninput     = e=>{ pts.sizePx=+e.target.value||10; $('ptSizeVal').textContent=pts.sizePx; draw(); };

  $('pxPerMm').oninput    = e=>{ pxPerMm=+e.target.value||6; $('pxPerMmVal').textContent=pxPerMm; draw(); };

  // ---------- запуск ----------
  fit();
  toast('Линия: две точки. Кнопки справа — задвижка/клапаны/насос, ставь на трубу.');
})();