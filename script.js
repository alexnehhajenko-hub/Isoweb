(function(){
  // ---------- утилиты ----------
  const DPR = Math.min(1.5, Math.max(1, (window.devicePixelRatio||1)));
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d', { alpha:false });
  const $ = id => document.getElementById(id);
  const toast = (t,ms=1200)=>{ const el=$('toast'); el.textContent=t; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),ms); };

  // ---------- состояние сцены ----------
  let mode='hand'; // hand | line | edit | place
  let panelOpen=false;
  const canvasFrozen = ()=>panelOpen;

  // геометрия
  const segs = [];                  // [{a:{x,y}, b:{x,y}}]
  const items = [];                 // [{type, segIndex, t}]
  const pts  = { show:true, sizePx:10 };
  const snap = { on:true, isoTolDeg:10, radiusPx:18, endStickPx:28, finalLimitPx:6 };
  let lineWidthPx = 6;
  let pxPerMm = 6;

  // фон-фото
  let bgImg=null;                   // ImageBitmap
  let bgW=0,bgH=0;

  // трансформация вида (пан/зум)
  const view = { scale:1, tx:0, ty:0 };
  const setScaleAround=(newScale, cx, cy)=>{
    const s = Math.max(0.4, Math.min(5, newScale));
    const k = s / view.scale;
    view.tx = cx - k*(cx - view.tx);
    view.ty = cy - k*(cy - view.ty);
    view.scale = s;
  };

  // правка конца
  const EDIT_HOLD_MS = 450;
  let holdTimer=null, editing=null; // {segIndex, end:'a'|'b'}

  // инструмент линии
  let firstPt=null, previewPt=null, axisLock={active:false,angle:null};

  // выбор элемента
  let placeType=null;

  // указатели
  const pointers=new Map();

  // offscreen слой линий
  const linesCv=document.createElement('canvas');
  const linesCtx=linesCv.getContext('2d',{alpha:true});

  // индикатор угла
  const angleTag = $('angleTag');
  const showAngleTag=(x,y,deg)=>{ angleTag.style.display='block'; angleTag.style.left=x+'px'; angleTag.style.top=y+'px'; angleTag.textContent=Math.round(deg)+'°'; };
  const hideAngleTag=()=>{ angleTag.style.display='none'; };

  // ---------- преобразования ----------
  function fit(){
    cv.width=Math.floor(innerWidth*DPR);
    cv.height=Math.floor(innerHeight*DPR);
    linesCv.width=cv.width; linesCv.height=cv.height;
    // подгон по фото при первом показе
    if(bgImg && view.scale===1 && view.tx===0 && view.ty===0){
      const k = Math.min(cv.width/bgW, cv.height/bgH);
      view.scale = k;
      view.tx = (cv.width - bgW*k)/2;
      view.ty = (cv.height - bgH*k)/2;
    }
    draw();
  }
  addEventListener('resize',fit);

  function screenToWorld(sx,sy){
    return { x:(sx - view.tx)/view.scale, y:(sy - view.ty)/view.scale };
  }
  function worldToScreen(x,y){
    return { x: x*view.scale + view.tx, y: y*view.scale + view.ty };
  }
  function getCanvasPoint(e){
    const r=cv.getBoundingClientRect();
    return { sx:(e.clientX-r.left)*DPR, sy:(e.clientY-r.top)*DPR };
  }

  // ---------- снап ----------
  function allNodes(){ const arr=[]; for(const s of segs){ arr.push(s.a,s.b); } if(firstPt) arr.push(firstPt); return arr; }

  function snapToNodes(raw){
    if(!snap.on) return raw;
    const R=snap.radiusPx, Rx=snap.endStickPx; // уже в мировых (не умножаем на DPR/scale)
    let best=null, bestD=Infinity;
    for(const n of allNodes()){
      const d=Math.hypot(n.x-raw.x, n.y-raw.y);
      const thr=(d<Rx?Rx:R);
      if(d<thr && d<bestD){ bestD=d; best=n; }
    }
    return best? {x:best.x,y:best.y, _lockNode:true}: raw;
  }

  function snapToSegmentExtension(raw, tol=10){
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
      if(d<=tol && d<bestD){ bestD=d; best={x:px,y:py}; }
    }
    if(best){ best._lockAxis=true; return best; }
    return raw;
  }

  const normDeg=a=>((a%360)+360)%360;
  const angDiff=(a,b)=>{ let d=Math.abs(a-b)%360; return d>180?360-d:d; };
  function adaptiveTol(start,end){
    const L=Math.hypot(end.x-start.x, end.y-start.y);
    const t=snap.isoTolDeg;
    if(L<40) return t+8; if(L<120) return t+4; if(L<240) return t; return Math.max(4,t-3);
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
    const dist=Math.hypot(rawEnd.x-snappedEnd.x, rawEnd.y-snappedEnd.y);
    return dist<=snap.finalLimitPx ? snappedEnd : rawEnd;
  }
  function finalizeWithSnap(start,endRaw){
    const merged=snapToNodes(endRaw);
    const axis=snapToAxes( snapToSegmentExtension(merged,10), start, Math.max(12, snap.isoTolDeg) );
    return limitFinal(endRaw,axis);
  }

  // ---------- отрисовка ----------
  function draw(){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);

    // фон-фото под видом
    if(bgImg){
      ctx.setTransform(view.scale,0,0,view.scale,view.tx,view.ty);
      ctx.drawImage(bgImg, 0,0, bgW,bgH);
    }

    // линии
    linesCtx.clearRect(0,0,linesCv.width,linesCv.height);
    linesCtx.setTransform(1,0,0,1,0,0);
    linesCtx.lineCap='round'; linesCtx.lineJoin='round';

    // рендер линий в экранных координатах (с учётом view)
    linesCtx.save();
    linesCtx.setTransform(view.scale,0,0,view.scale,view.tx,view.ty);
    for(const s of segs){
      linesCtx.strokeStyle='#5b00bf'; linesCtx.lineWidth=(lineWidthPx+2)/DPR; linesCtx.globalAlpha=.7;
      linesCtx.beginPath(); linesCtx.moveTo(s.a.x,s.a.y); linesCtx.lineTo(s.b.x,s.b.y); linesCtx.stroke();
      linesCtx.strokeStyle='#7b2cff'; linesCtx.lineWidth=(lineWidthPx)/DPR; linesCtx.globalAlpha=1;
      linesCtx.beginPath(); linesCtx.moveTo(s.a.x,s.a.y); linesCtx.lineTo(s.b.x,s.b.y); linesCtx.stroke();
    }

    // элементы на трубе
    linesCtx.strokeStyle='#111'; linesCtx.fillStyle='#111'; linesCtx.lineWidth=1/DPR;
    items.forEach(it=>{
      const s=segs[it.segIndex]; if(!s) return;
      const ax=s.a.x, ay=s.a.y, bx=s.b.x, by=s.b.y;
      const vx=bx-ax, vy=by-ay; const L=Math.hypot(vx,vy); if(L<1) return;
      const nx=vx/L, ny=vy/L;
      const px=ax+nx*L*it.t, py=ay+ny*L*it.t;
      const angle=Math.atan2(vy,vx);
      const orientation = (Math.abs(Math.sin(angle))<0.45)? 'top' : 'front';
      linesCtx.save(); linesCtx.translate(px,py); linesCtx.rotate(angle);
      window.ValveLib.draw(it.type, linesCtx, pxPerMm, orientation);
      linesCtx.restore();
    });

    // превью линии
    if(firstPt && previewPt){
      linesCtx.setLineDash([8,8]); linesCtx.strokeStyle='#16a34a'; linesCtx.lineWidth=Math.max(3,lineWidthPx-2)/DPR;
      linesCtx.beginPath(); linesCtx.moveTo(firstPt.x,firstPt.y); linesCtx.lineTo(previewPt.x,previewPt.y); linesCtx.stroke();
      linesCtx.setLineDash([]);
    }

    // точки
    if(pts.show){
      const size=pts.sizePx/DPR;
      const dot=p=>{
        linesCtx.beginPath(); linesCtx.fillStyle='rgba(123,44,255,.33)'; linesCtx.arc(p.x,p.y,size*.9,0,Math.PI*2); linesCtx.fill();
        linesCtx.beginPath(); linesCtx.fillStyle='#7b2cff'; linesCtx.arc(p.x,p.y,size*.65,0,Math.PI*2); linesCtx.fill();
        linesCtx.beginPath(); linesCtx.fillStyle='#fff'; linesCtx.arc(p.x,p.y,size*.28,0,Math.PI*2); linesCtx.fill();
      };
      for(const s of segs){ dot(s.a); dot(s.b); }
      if(firstPt) dot(firstPt);
      if(previewPt){ linesCtx.beginPath(); linesCtx.fillStyle='#16a34a'; linesCtx.arc(previewPt.x,previewPt.y,size*.5,0,Math.PI*2); linesCtx.fill(); }
    }

    linesCtx.restore();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.drawImage(linesCv,0,0);
  }

  // ближайший сегмент и параметр t (0..1) в мировых координатах
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

  // ---------- жесты / ввод ----------
  let lastPan=null; // {x,y} в экране

  cv.addEventListener('pointerdown', e=>{
    if(canvasFrozen()) return;
    e.preventDefault();
    cv.setPointerCapture?.(e.pointerId);
    const {sx,sy}=getCanvasPoint(e);
    const p={sx,sy}; pointers.set(e.pointerId,p);
    if(pointers.size===1) lastPan={x:sx,y:sy};

    // long-press для правки конца
    clearTimeout(holdTimer);
    holdTimer=setTimeout(()=>{
      if(mode!=='line'){
        const world=screenToWorld(sx,sy);
        const hit=findEndpointNear(world.x,world.y,18);
        if(hit){ mode='edit'; editing=hit; toast('Правка конца: потяни'); }
      }
    }, EDIT_HOLD_MS);

    // превью линии
    if(mode==='line' && firstPt){
      const world=screenToWorld(sx,sy);
      const pr=previewWithSnap(world,firstPt); previewPt=pr;
      if(pr._deg!=null){
        const scr=worldToScreen(pr.x,pr.y); showAngleTag(scr.x/DPR, scr.y/DPR, pr._deg);
      }
      draw();
    }
  }, {passive:false});

  cv.addEventListener('pointermove', e=>{
    if(canvasFrozen()) return;
    e.preventDefault();
    if(!pointers.has(e.pointerId)) return;
    const {sx,sy}=getCanvasPoint(e);
    const cur={sx,sy}; pointers.set(e.pointerId,cur);

    // pinch-zoom
    if(pointers.size>=2){
      const pts=[...pointers.values()];
      const [p0,p1]=pts;
      if(!p0.prev || !p1.prev){
        p0.prev={...p0}; p1.prev={...p1};
      }else{
        const d0=Math.hypot(p0.prev.sx-p1.prev.sx, p0.prev.sy-p1.prev.sy);
        const d1=Math.hypot(p0.sx-p1.sx, p0.sy-p1.sy);
        if(d0>0){
          const cx=(p0.sx+p1.sx)/2, cy=(p0.sy+p1.sy)/2;
          setScaleAround(view.scale*(d1/d0), cx, cy);
          draw();
        }
        p0.prev={...p0}; p1.prev={...p1};
      }
      return;
    }

    // панорамирование
    if(mode==='hand' || mode==='place' || (mode==='line' && !firstPt)){
      if(lastPan){
        const dx=sx-lastPan.x, dy=sy-lastPan.y;
        view.tx += dx; view.ty += dy; lastPan={x:sx,y:sy}; draw();
      }
    }

    if(mode==='edit' && editing){
      const s=segs[editing.segIndex];
      const start=(editing.end==='a')? s.b : s.a;
      let w=screenToWorld(sx,sy);
      w=previewWithSnap(w,start);
      if(editing.end==='a') s.a=w; else s.b=w;
      if(w._deg!=null){
        const scr=worldToScreen(w.x,w.y); showAngleTag(scr.x/DPR, scr.y/DPR, w._deg);
      }
      draw();
    }

    if(mode==='line' && firstPt){
      let w=screenToWorld(sx,sy);
      w=previewWithSnap(w,firstPt);
      previewPt=w;
      if(w._deg!=null){
        const scr=worldToScreen(w.x,w.y); showAngleTag(scr.x/DPR, scr.y/DPR, w._deg);
      } else hideAngleTag();
      draw();
    }
  }, {passive:false});

  function endPointers(e){
    pointers.delete(e.pointerId);
    if(pointers.size===0) lastPan=null;
  }

  cv.addEventListener('pointerup', e=>{
    if(canvasFrozen()) return;
    e.preventDefault();
    endPointers(e);
    clearTimeout(holdTimer);
    hideAngleTag();

    // place element
    if(mode==='place' && placeType){
      if(!segs.length){ toast('Сначала нарисуй линию'); return; }
      const {sx,sy}=getCanvasPoint(e);
      const raw=screenToWorld(sx,sy);
      const near=nearestSegmentParam(raw);
      if(near){ items.push({type:placeType, segIndex:near.segIndex, t:near.t}); draw(); }
      return;
    }

    if(mode==='edit' && editing){
      const s=segs[editing.segIndex];
      const start=(editing.end==='a')? s.b : s.a;
      const end  =(editing.end==='a')? s.a : s.b;
      const fixed=finalizeWithSnap(start,end);
      if(editing.end==='a') s.a=fixed; else s.b=fixed;
      mode='hand'; editing=null; clearAxis(); draw(); return;
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

  // колесо — масштаб
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const {sx,sy}=getCanvasPoint(e);
    const delta = (e.deltaY<0)? 1.08 : 0.92;
    setScaleAround(view.scale*delta, sx, sy);
    draw();
  }, {passive:false});

  // поиск конца для правки (в мировых координатах)
  function findEndpointNear(x,y,r=18){
    let best=null,bestD=Infinity;
    for(let i=0;i<segs.length;i++){
      const s=segs[i];
      const dA=Math.hypot(s.a.x-x,s.a.y-y);
      const dB=Math.hypot(s.b.x-x,s.b.y-y);
      if(dA<bestD && dA<=r){best={segIndex:i,end:'a'};bestD=dA;}
      if(dB<bestD && dB<=r){best={segIndex:i,end:'b'};bestD=dB;}
    }
    return best;
  }

  // ---------- кнопки/меню ----------
  function setActive(idArr){
    const all=['btnHand','btnLine'];
    all.forEach(id=>$(id).classList.toggle('active', idArr.includes(id)));
  }

  $('btnHand').onclick = ()=>{ mode='hand'; placeType=null; firstPt=null; previewPt=null; hideAngleTag(); setActive(['btnHand']); toast('Рука'); };
  $('btnLine').onclick = ()=>{ mode='line'; placeType=null; firstPt=null; previewPt=null; hideAngleTag(); setActive(['btnLine']); toast('Линия: поставь 2 точки'); };
  $('btnUndo').onclick = ()=>{ if(firstPt && mode==='line'){ firstPt=null; previewPt=null; mode='hand'; } else if(segs.length){ segs.pop(); } draw(); };
  $('btnExport').onclick=()=>{ const url=cv.toDataURL('image/png',0.95); const a=document.createElement('a'); a.href=url; a.download='IsoPipe.png'; a.click(); };

  $('btnZoomIn').onclick = ()=>{ setScaleAround(view.scale*1.15, cv.width/2, cv.height/2); draw(); };
  $('btnZoomOut').onclick= ()=>{ setScaleAround(view.scale/1.15, cv.width/2, cv.height/2); draw(); };
  $('btnFit').onclick    = ()=>{ if(bgImg){ const k=Math.min(cv.width/bgW, cv.height/bgH); view.scale=k; view.tx=(cv.width-bgW*k)/2; view.ty=(cv.height-bgH*k)/2; } else { view.scale=1; view.tx=view.ty=0; } draw(); };

  // меню «Элементы»
  const libMenu=$('libMenu'); $('btnLib').onclick=()=>libMenu.classList.toggle('open');
  libMenu.addEventListener('click', e=>{
    const btn=e.target.closest('button[data-type]'); if(!btn) return;
    libMenu.classList.remove('open');
    mode='place'; placeType=btn.dataset.type; setActive(['btnHand']);
    toast('Тапни по трубе для установки');
  });

  // меню «Медиа»
  const mediaMenu=$('mediaMenu'); $('btnMedia').onclick=()=>mediaMenu.classList.toggle('open');
  $('btnClearImage').onclick=()=>{ bgImg=null; draw(); mediaMenu.classList.remove('open'); };

  $('pickImage').addEventListener('change', async (ev)=>{
    const file=ev.target.files && ev.target.files[0]; if(!file) return;
    const bmp = await createImageBitmap(file);
    bgImg=bmp; bgW=bmp.width; bgH=bmp.height;
    // fit по фото
    const k = Math.min(cv.width/bgW, cv.height/bgH);
    view.scale = k; view.tx = (cv.width - bgW*k)/2; view.ty = (cv.height - bgH*k)/2;
    draw(); mediaMenu.classList.remove('open');
  });

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

  // ---------- старт ----------
  fit();
  toast('Линия: две точки. «Элементы ▾» — выбери вентиль/насос. «Медиа ▾» — фото под чертёж.');
})();