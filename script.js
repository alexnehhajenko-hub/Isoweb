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
  const pts  = { show:false, sizePx:10 }; // точки off по умолчанию
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
  const angDiff=(a,b)=>{ let d=Math.abs(a-b)%360; return d>180?360-d:d; };
  function adaptiveTol(start,end){ const L=Math.hypot(end.x-start.x,end.y-start.y); const t=snap.isoTolDeg; if(L<40) return t+8; if(L<120) return t+4; if(L<240) return t; return Math.max(4,t-3); }
  const lockTargets=[0,90,180,-90,30,150,210,330];
  function snapToAxes(raw,start,tolDeg){
    if(!snap.on || !start) return raw;
    const v={x:raw.x-start.x,y:raw.y-start.y}, L=Math.hypot(v.x,v.y); if(L===0) return raw;
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
  function limitFinal(rawEnd, snappedEnd){ if(!snap.on) return snappedEnd; const dist=Math.hypot(rawEnd.x-snappedEnd.x, rawEnd.y-snappedEnd