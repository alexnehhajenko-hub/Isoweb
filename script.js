(function(){
  // ===== базовые утилиты / DOM =====
  const DPR = Math.min(1.5, Math.max(1, (window.devicePixelRatio||1)));
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d', { alpha:false });
  const $ = id => document.getElementById(id);
  const topBar = $('topBar');
  const toast = (t,ms=1200)=>{ const el=$('toast'); el.textContent=t; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),ms); };

  // ===== состояние =====
  let mode='hand'; // hand | line | edit | place
  let panelOpen=false;
  const canvasFrozen = ()=>panelOpen;

  const segs = [];                 // [{a:{x,y}, b:{x,y}}]
  const items = [];                // [{type, segIndex, t}]
  const pts  = { show:false, sizePx:10 }; // точки off по умолчанию (быстрее)
  const snap = { on:true, isoTolDeg:10, radiusPx:18, endStickPx:28, finalLimitPx:6 };
  let lineWidthPx = 6;
  let pxPerMm = 6;

  // фон-фото
  let bgImg=null, bgW=0, bgH=0;

  // трансформация вида
  const view = { scale:1, tx:0, ty:0 };
  const setScaleAround=(newScale, cx, cy)=>{
    const s = Math.max(0.4, Math.min(5, newScale));
    const k = s / view.scale;
    view.tx = cx - k*(cx - view.tx);
    view.ty = cy - k*(cy - view.ty);
    view.scale = s;
    requestRedraw();
  };

  // throttle перерисовок
  let raf=0, dirty=false;
  const requestRedraw=()=>{ dirty=true; if(!raf){ raf=requestAnimationFrame(()=>{ raf=0; if(dirty){ dirty=false; draw(); } }); } };

  // редактирование конца
  const EDIT_HOLD_MS = 450;
  let holdTimer=null, editing=null; // {segIndex, end:'a'|'b'}

  // линия
  let firstPt=null, previewPt=null, axisLock={active:false,angle:null};

  // выбор элемента
  let placeType=null;

  // указатели
  const pointers=new Map();

  // слой линий
  const linesCv=document.createElement('canvas');
  const linesCtx=linesCv.getContext('2d',{alpha:true});

  // индикатор угла
  const angleTag = $('angleTag');
  const showAngleTag=(x,y,deg)=>{ angleTag.style.display='block'; angleTag.style.left=x+'px'; angleTag.style.top=y+'px'; angleTag.textContent=Math.round(deg)+'°'; };
  const hideAngleTag=()=>{ angleTag.style.display='none'; };

  // ===== размеры/координаты =====
  function fit(){
    cv.width=Math.floor(innerWidth*DPR);
    cv.height=Math.floor(innerHeight*DPR);
    linesCv.width=cv.width; linesCv.height=cv.height;
    if(bgImg && view.scale===1 && view.tx===0 && view.ty===0){
      const k = Math.min(cv.width/bgW, cv.height/bgH);
      view.scale = k; view.tx = (cv.width - bgW*k)/2; view.ty = (cv.height - bgH*k)/2;
    }
    requestRedraw();
  }
  addEventListener('resize',fit);

  const screenToWorld=(sx,sy)=>({ x:(sx - view.tx)/view.scale, y:(sy - view.ty)/view.scale });
  const worldToScreen=(x,y)=>({ x: x*view.scale + view.tx, y: y*view.scale + view.ty });
  const getCanvasPoint=e=>{ const r=cv.getBoundingClientRect(); return { sx:(e.clientX-r.left)*DPR, sy:(e.clientY-r.top)*DPR }; };

  // ===== снап =====
  function allNodes(){ const arr=[]; for(const s of segs){ arr.push(s.a,s.b); } if(firstPt) arr.push(firstPt); return arr; }
  function snapToNodes(raw){ if(!snap.on) return raw; const R=snap.radiusPx, Rx=snap.endStickPx; let best=null,bestD=Infinity;
    for(const n of allNodes()){ const d=Math.hypot(n.x-raw.x, n.y-raw.y); const thr=(d<Rx?Rx:R); if(d<thr && d<bestD){ bestD=d; best=n; } }
    return best?{x:best.x,y:best.y,_lockNode:true}:raw;
  }
  function snapToSegmentExtension(raw, tol=10){ if(!snap.on||!segs.length) return raw; let best=null,bestD=Infinity;
    for(const s of segs){ const A=s.a,B=s.b; const vx=B.x-A.x,vy=B.y-A.y,L=Math.hypot(vx,vy); if(L<1) continue;
      const nx=vx/L, ny=vy/L; const wx=raw.x-A.x, wy=raw.y-A.y; const proj=wx*nx+wy*ny;
      const px=A.x+nx*proj, py=A.y+ny*proj; const d=Math.hypot(raw.x-px, raw.y-py);
      if(d<=tol && d<bestD){ bestD=d; best={x:px,y:py}; }
    }
    if(best){ best._lockAxis=true; return best; }
    return raw;
  }
  const normDeg=a=>((a%360)+360)%360;
  const angDiff=(a,b)=>{ let d=Math.abs(a-b)%360; return d>180?360-д:d; };
  function adaptiveTol(start,end){ const L=Math.hypот(end.x-start.x,end.y-start.y); const t=snap.isoTolDeg; if(L<40) return t+8; if(L<120) return t+4; if(L<240) return t; return Math.max(4,t-3); }
  const lockTargets=[0,90,180,-90,30,150,210,330];
  function snapToAxes(raw,start,tolDeg){
    if(!snap.on || !start) return raw;
    const v={x:raw.x-start.x,y:raw.y-start.y}, L=Math.hypот(v.x,v.y); if(L===0) return raw;
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
      const a=bestA*Math.PI/180; return { x:start.x+Math.cos(a)*L, y:start.y+Math.sin(a)*L, _lockAxis:true, _deg:bestA };
    }
    return raw;
  }
  function clearAxis(){ axisLock.active=false; axisLock.angle=null; }
  function previewWithSnap(raw,start){ let p=snapToNodes(raw); const ext=snapToSegmentExtension(p,10); if(ext._lockAxis){ axisLock.active=true; return ext; } p=ext; return snapToAxes(p,start,adaptiveTol(start,p)); }
  function limitFinal(rawEnd, snappedEnd){ if(!snap.on) return snappedEnd; const dist=Math.hypот(rawEnd.x-snappedEnd.x, rawEnd.y-snappedEnd.y); return dist<=snap.finalLimitPx?snappedEnd:rawEnd; }
  function finalizeWithSnap(start,endRaw){ const merged=snapToNodes(endRaw); const axis=snapToAxes( snapToSegmentExtension(merged,10), start, Math.max(12, snap.isoTolDeg) ); return limitFinal(endRaw,axis); }

  // ===== отрисовка =====
  function draw(){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);

    if(bgImg){ ctx.setTransform(view.scale,0,0,view.scale,view.tx,view.ty); ctx.drawImage(bgImg,0,0,bgW,bgH); }

    linesCtx.setTransform(1,0,0,1,0,0);
    linesCtx.clearRect(0,0,linesCv.width,linesCv.height);
    linesCtx.setTransform(view.scale,0,0,view.scale,view.tx,view.ty);
    linesCtx.lineCap='round'; linesCtx.lineJoin='round';

    // трубы
    for(const s of segs){
      linesCtx.strokeStyle='#5b00bf'; linesCtx.lineWidth=(lineWidthPx+2)/DPR; linesCtx.globalAlpha=.7;
      linesCtx.beginPath(); linesCtx.moveTo(s.a.x,s.a.y); linesCtx.lineTo(s.b.x,s.b.y); linesCtx.stroke();
      linesCtx.strokeStyle='#7b2cff'; linesCtx.lineWidth=(lineWidthPx)/DPR; linesCtx.globalAlpha=1;
      linesCtx.beginPath(); linesCtx.moveTo(s.a.x,s.a.y); linesCtx.lineTo(s.b.x,s.b.y); linesCtx.stroke();
    }

    // элементы (без падения, если ValveLib ещё не загружен)
    if (window.ValveLib && typeof window.ValveLib.draw==='function'){
      items.forEach(it=>{
        const s=segs[it.segIndex]; if(!s) return;
        const vx=s.b.x-s.a.x, vy=s.b.y-s.a.y, L=Math.hypot(vx,vy); if(L<1) return;
        const nx=vx/L, ny=vy/L; const px=s.a.x+nx*L*it.t, py=s.a.y+ny*L*it.t;
        const angle=Math.atan2(vy,vx);
        const orientation=(Math.abs(Math.sin(angle))<0.45)?'top':'front';
        linesCtx.save(); linesCtx.translate(px,py); linesCtx.rotate(angle);
        window.ValveLib.draw(it.type, linesCtx, pxPerMm, orientation);
        linesCtx.restore();
      });
    }

    // превью
    if(firstPt && previewPt){
      linesCtx.setLineDash([8,8]); linesCtx.strokeStyle='#16a34a'; linesCtx.lineWidth=Math.max(3,lineWidthPx-2)/DPR;
      linesCtx.beginPath(); linesCtx.moveTo(firstPt.x,firstPt.y); linesCtx.lineTo(previewPt.x,previewPt.y); linesCtx.stroke();
      linesCtx.setLineDash([]);
    }

    // точки (опционально)
    const showDotsNow = pts.show && view.scale>0.85 && segs.length<800;
    if(showDotsNow){
      const size=pts.sizePx/DPR;
      const dot=p=>{
        linesCtx.beginPath(); linesCtx.fillStyle='rgba(123,44,255,.33)'; linesCtx.arc(p.x,p.y,size*.9,0,Math.PI*2); linesCtx.fill();
        linesCtx.beginPath(); linesCtx.fillStyle='#7b2cff'; linesCtx.arc(p.x,p.y,size*.65,0,Math.PI*2); linesCtx.fill();
        linesCtx.beginPath(); linesCtx.fillStyle='#fff'; linesCtx.arc(p.x,p.y,size*.28,0,Math.PI*2); linesCtx.fill();
      };
      const seen=new Set(), key=p=>`${Math.round(p.x)}|${Math.round(p.y)}`;
      for(const s of segs){
        if(!seen.has(key(s.a))){ dot(s.a); seen.add(key(s.a)); }
        if(!seen.has(key(s.b))){ dot(s.b); seen.add(key(s.b)); }
      }
      if(firstPt && !seen.has(key(firstPt))){ dot(firstPt); }
      if(previewPt){ linesCtx.beginPath(); linesCtx.fillStyle='#16a34a'; linesCtx.arc(previewPt.x,previewPt.y,size*.5,0,Math.PI*2); linesCtx.fill(); }
    }

    ctx.setTransform(1,0,0,1,0,0);
    ctx.drawImage(linesCv,0,0);
  }

  // ближайший сегмент
  function nearestSegmentParam(raw){
    let best=null,bestD=Infinity, idx=-1;
    for(let i=0;i<segs.length;i++){
      const s=segs[i], A=s.a,B=s.b; const vx=B.x-A.x, vy=B.y-A.y, L=Math.hypot(vx,vy); if(L<1) continue;
      const nx=vx/L, ny=vy/L; const wx=raw.x-A.x, wy=raw.y-A.y; let proj=wx*nx+wy*ny; proj=Math.max(0,Math.min(L,proj));
      const px=A.x+nx*proj, py=A.y+ny*proj; const d=Math.hypot(raw.x-px,raw.y-py);
      if(d<bestD){ bestD=d; best={t:(L?proj/L:0)}; idx=i; }
    }
    return (idx>=0)?{segIndex:idx,...best}:null;
  }

  // ===== жесты =====
  let lastPan=null, lastTap=0, swallowTap=false;

  // двойной тап — прячем/показываем панель
  cv.addEventListener('pointerdown', e=>{
    const now=performance.now();
    if(now-lastTap<260){ topBar.classList.toggle('hidden'); swallowTap=true; setTimeout(()=>swallowTap=false,0); }
    lastTap=now;
  }, {passive:true});

  cv.addEventListener('pointerdown', e=>{
    if(canvasFrozen() || swallowTap) return;
    e.preventDefault();
    cv.setPointerCapture?.(e.pointerId);
    const {sx,sy}=getCanvasPoint(e);
    pointers.set(e.pointerId,{sx,sy});
    if(pointers.size===1) lastPan={x:sx,y:sy};

    clearTimeout(holdTimer);
    holdTimer=setTimeout(()=>{
      if(mode!=='line'){
        const world=screenToWorld(sx,sy);
        const hit=findEndpointNear(world.x,world.y,18);
        if(hit){ mode='edit'; editing=hit; toast('Правка конца: потяни'); }
      }
    }, EDIT_HOLD_MS);

    if(mode==='line' && firstPt){
      const world=screenToWorld(sx,sy);
      const pr=previewWithSnap(world,firstPt); previewPt=pr;
      if(pr._deg!=null){ const scr=worldToScreen(pr.x,pr.y); showAngleTag(scr.x/DPR,scr.y/DPR,pr._deg); }
      requestRedraw();
    }
  }, {passive:false});

  cv.addEventListener('pointermove', e=>{
    if(canvasFrozen()) return;
    e.preventDefault();
    if(!pointers.has(e.pointerId)) return;
    const {sx,sy}=getCanvasPoint(e);
    pointers.set(e.pointerId,{sx,sy});

    // pinch
    if(pointers.size>=2){
      const [p0,p1]=[...pointers.values()];
      if(!p0.prev||!p1.prev){ p0.prev={...p0}; p1.prev={...p1}; }
      else{
        const d0=Math.hypot(p0.prev.sx-p1.prev.sx,p0.prev.sy-p1.prev.sy);
        const d1=Math.hypot(p0.sx-p1.sx,p0.sy-p1.sy);
        if(d0>0){ const cx=(p0.sx+p1.sx)/2, cy=(p0.sy+p1.sy)/2; setScaleAround(view.scale*(d1/d0), cx, cy); }
        p0.prev={...p0}; p1.prev={...p1};
      }
      return;
    }

    // панорамирование
    if(mode==='hand' || mode==='place' || (mode==='line' && !firstPt)){
      if(lastPan){ view.tx+=sx-lastPan.x; view.ty+=sy-lastPan.y; lastPan={x:sx,y:sy}; requestRedraw(); }
    }

    if(mode==='edit' && editing){
      const s=segs[editing.segIndex]; const start=(editing.end==='a')? s.b : s.a;
      let w=screenToWorld(sx,sy); w=previewWithSnap(w,start);
      if(editing.end==='a') s.a=w; else s.b=w;
      if(w._deg!=null){ const scr=worldToScreen(w.x,w.y); showAngleTag(scr.x/DPR,scr.y/DPR,w._deg); }
      requestRedraw();
    }

    if(mode==='line' && firstPt){
      let w=screenToWorld(sx,sy); w=previewWithSnap(w,firstPt); previewPt=w;
      if(w._deg!=null){ const scr=worldToScreen(w.x,w.y); showAngleTag(scr.x/DPR,scr.y/DPR,w._deg); } else hideAngleTag();
      requestRedraw();
    }
  }, {passive:false});

  function endPointers(e){ pointers.delete(e.pointerId); if(pointers.size===0) lastPan=null; }

  cv.addEventListener('pointerup', e=>{
    if(canvasFrozen() || swallowTap) return;
    e.preventDefault();
    endPointers(e);
    clearTimeout(holdTimer);
    hideAngleTag();

    // постановка элемента — по одному
    if(mode==='place' && placeType){
      if(!segs.length){ toast('Сначала нарисуй линию'); return; }
      const {sx,sy}=getCanvasPoint(e); const raw=screenToWorld(sx,sy);
      const near=nearestSegmentParam(raw);
      if(near){ items.push({type:placeType, segIndex:near.segIndex, t:near.t}); requestRedraw(); }
      placeType=null; mode='hand'; setActive(['btnHand']); return;
    }

    if(mode==='edit' && editing){
      const s=segs[editing.segIndex];
      const start=(editing.end==='a')? s.b : s.a;
      const end  =(editing.end==='a')? s.a : s.b;
      const fixed=finalizeWithSnap(start,end);
      if(editing.end==='a') s.a=fixed; else s.b=fixed;
      mode='hand'; editing=null; clearAxis(); requestRedraw(); return;
    }

    if(mode==='line'){
      const {sx,sy}=getCanvasPoint(e); const raw=screenToWorld(sx,sy);
      if(!firstPt){ firstPt=snapToNodes(raw); previewPt=null; clearAxis(); requestRedraw(); return; }
      const proposed=finalizeWithSnap(firstPt,(previewPt||raw)); segs.push({a:firstPt,b:proposed});
      firstPt=null; previewPt=null; mode='hand'; clearAxis(); requestRedraw(); return;
    }
  }, {passive:false});

  cv.addEventListener('pointercancel', e=>{
    endPointers(e); clearTimeout(holdTimer); hideAngleTag(); requestRedraw();
  }, {passive:true});

  // колесо — масштаб (десктоп)
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const {sx,sy}=getCanvasPoint(e);
    setScaleAround(view.scale*(e.deltaY<0?1.08:0.92), sx, sy);
  }, {passive:false});

  // поиск конца (мировые координаты)
  function findEndpointNear(x,y,r=18){
    let best=null,bestD=Infinity;
    for(let i=0;i<segs.length;i++){
      const s=segs[i]; const dA=Math.hypot(s.a.x-x,s.a.y-y); const dB=Math.hypot(s.b.x-x,s.b.y-y);
      if(dA<bestD&&dA<=r){best={segIndex:i,end:'a'};bestD=dA;}
      if(dB<bestD&&dB<=r){best={segIndex:i,end:'b'};bestD=dB;}
    }
    return best;
  }

  // ===== кнопки/меню =====
  function setActive(ids){ ['btnHand','btnLine'].forEach(id=>$(id).classList.toggle('active', ids.includes(id))); }
  $('btnHand').onclick = ()=>{ mode='hand'; placeType=null; firstPt=null; previewPt=null; hideAngleTag(); setActive(['btnHand']); toast('Рука'); };
  $('btnLine').onclick = ()=>{ mode='line'; placeType=null; firstPt=null; previewPt=null; hideAngleTag(); setActive(['btnLine']); toast('Линия: две точки'); };

  $('btnUndo').onclick = ()=>{ if(firstPt&&mode==='line'){ firstPt=null; previewPt=null; mode='hand'; } else if(segs.length){ segs.pop(); } requestRedraw(); };
  $('btnClear').onclick = ()=>{ segs.length=0; items.length=0; firstPt=null; previewPt=null; clearAxis(); requestRedraw(); };

  $('btnExport').onclick=()=>{ const url=cv.toDataURL('image/png',0.95); const a=document.createElement('a'); a.href=url; a.download='IsoPipe.png'; a.click(); };
  $('btnZoomIn').onclick = ()=>{ setScaleAround(view.scale*1.15, cv.width/2, cv.height/2); };
  $('btnZoomOut').onclick= ()=>{ setScaleAround(view.scale/1.15, cv.width/2, cv.height/2); };
  $('btnFit').onclick    = ()=>{ if(bgImg){ const k=Math.min(cv.width/bgW, cv.height/bgH); view.scale=k; view.tx=(cv.width-bgW*k)/2; view.ty=(cv.height-bgH*k)/2; } else { view.scale=1; view.tx=view.ty=0; } requestRedraw(); };

  const libMenu=$('libMenu'); $('btnLib').onclick=()=>libMenu.classList.toggle('open');
  libMenu.addEventListener('click', e=>{
    const btn=e.target.closest('button[data-type]'); if(!btn) return;
    libMenu.classList.remove('open');
    mode='place'; placeType=btn.dataset.type; setActive(['btnHand']);
    toast('Тапни по трубе для установки');
  });

  const mediaMenu=$('mediaMenu'); $('btnMedia').onclick=()=>mediaMenu.classList.toggle('open');

  async function fileToBitmap(file){
    if('createImageBitmap' in window){
      try{ return await createImageBitmap(file); }catch(_){}
    }
    return await new Promise((resolve, reject)=>{
      const img=new Image(); img.onload=()=>resolve(img); img.onerror=reject;
      img.src=URL.createObjectURL(file);
    });
  }
  $('pickImage').addEventListener('change', async (e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const bmp=await fileToBitmap(file);
    bgImg=bmp; bgW=bmp.width; bgH=bmp.height;
    const k=Math.min(cv.width/bgW, cv.height/bgH);
    view.scale=k; view.tx=(cv.width-bgW*k)/2; view.ty=(cv.height-bgH*k)/2;
    requestRedraw(); mediaMenu.classList.remove('open');
    e.target.value=''; // можно выбрать тот же файл повторно
  });
  $('btnClearImage').onclick=()=>{ bgImg=null; requestRedraw(); mediaMenu.classList.remove('open'); };

  // панель настроек
  const wrap=$('panelWrap'), panel=$('panel'), backdrop=$('panelBackdrop');
  let lastFocus=null;
  const openPanel=()=>{ lastFocus=document.activeElement; panelOpen=true; wrap.classList.add('open'); wrap.setAttribute('aria-hidden','false'); cv.style.pointerEvents='none'; document.body.style.overflow='hidden'; panel.focus(); };
  const closePanel=()=>{ panelOpen=false; wrap.classList.remove('open'); wrap.setAttribute('aria-hidden','true'); cv.style.pointerEvents='auto'; document.body.style.overflow=''; (lastFocus||$('btnSettings')).focus(); };
  $('btnSettings').onclick=openPanel; $('btnDone').onclick=closePanel; backdrop.onclick=closePanel;
  addEventListener('keydown', e=>{ if(panelOpen && e.key==='Escape') closePanel(); });
  ['pointerdown','pointermove','pointerup','touchstart','touchmove','touchend','mousedown','mousemove','mouseup','wheel','click'].forEach(ev=>{
    panel.addEventListener(ev, ev2=>ev2.stopPropagation(), {passive:false});
  });

  // настройки
  $('snapOn').onchange    = e=>{ snap.on=!!e.target.checked; clearAxis(); };
  $('snapRadius').oninput = e=>{ snap.radiusPx=+e.target.value||18; $('snapRadiusVal').textContent=e.target.value; };
  $('isoTol').oninput     = e=>{ snap.isoTolDeg=+e.target.value||10; $('isoTolVal').textContent=e.target.value; };
  $('endStick').oninput   = e=>{ snap.endStickPx=+e.target.value||28; $('endStickVal').textContent=e.target.value; };
  $('finalSnapLimit').oninput = e=>{ snap.finalLimitPx=+e.target.value||6; $('finalSnapLimitVal').textContent=e.target.value; };
  $('lineWidth').oninput  = e=>{ lineWidthPx=+e.target.value||6; $('lineWidthVal').textContent=lineWidthPx; requestRedraw(); };
  $('showPoints').onchange= e=>{ pts.show=!!e.target.checked; requestRedraw(); };
  $('ptSize').oninput     = e=>{ pts.sizePx=+e.target.value||10; $('ptSizeVal').textContent=pts.sizePx; requestRedraw(); };
  $('pxPerMm').oninput    = e=>{ pxPerMm=+e.target.value||6; $('pxPerMmVal').textContent=pxPerMm; requestRedraw(); };

  // старт
  fit();
  toast('Линия: две точки. Элементы — меню «🔧 Элементы». Двойной тап по холсту — спрятать панель.');
})();