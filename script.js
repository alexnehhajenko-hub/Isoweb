(function(){
  const cv=document.getElementById('cv');
  const ctx=cv.getContext('2d',{alpha:false});
  const DPR=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  const toast=(t,ms=900)=>{const el=document.getElementById('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),ms);};

  const st={mode:'idle', first:null, preview:null, segs:[], valves:[], s:1*DPR, cx:0, cy:0};

  function resize(){
    cv.width=Math.round(innerWidth*DPR);
    cv.height=Math.round(innerHeight*DPR);
    if(st.cx===0&&st.cy===0){ st.cx=cv.width/2; st.cy=cv.height/2; }
    draw();
  }
  addEventListener('resize',resize,{passive:true}); resize();

  const w2s=p=>({x:st.cx+p.x*st.s, y:st.cy+p.y*st.s});
  const s2w=(sx,sy)=>({x:(sx-st.cx)/st.s, y:(sy-st.cy)/st.s});

  function grid(){
    const step=200, angs=[30,90,150];
    ctx.save();
    for(const a of angs){
      const r=a*Math.PI/180, vx=Math.cos(r), vy=Math.sin(r), px=-vy, py=vx;
      const stepScr=step*st.s, need=Math.ceil(Math.max(cv.width,cv.height)/stepScr)+2;
      for(let k=-need;k<=need;k++){
        const bx=px*k*step, by=py*k*step;
        const A=w2s({x:bx-vx*9999,y:by-vy*9999}), B=w2s({x:bx+vx*9999,y:by+vy*9999});
        ctx.strokeStyle=(k%3===0)?'#b7bcc8':'#dcdfe6'; ctx.lineWidth=(k%3===0)?1.4:1;
        ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
      }
    } ctx.restore();
  }

  function drawValve(ctx,A,B){
    ctx.save();
    ctx.lineCap='round';
    ctx.strokeStyle='#7b2cff';
    ctx.lineWidth=6*DPR;
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();

    const ang=Math.atan2(B.y-A.y, B.x-A.x);
    const mid={x:(A.x+B.x)/2,y:(A.y+B.y)/2};
    ctx.translate(mid.x, mid.y);
    ctx.rotate(ang);

    const w=12*DPR, h=8*DPR;
    ctx.fillStyle='#7b2cff';
    ctx.strokeStyle='#4a21a8';
    ctx.lineWidth=1.5*DPR;

    ctx.beginPath();
    ctx.moveTo(-w*0.5,0);
    ctx.lineTo(0,-h*0.65);
    ctx.lineTo(w*0.5,0);
    ctx.lineTo(0,h*0.65);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.strokeStyle='#111';
    ctx.lineWidth=2*DPR;
    ctx.beginPath(); ctx.moveTo(0,-h*0.95); ctx.lineTo(0,-h*1.8); ctx.stroke();

    ctx.restore();
  }

  function draw(){
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
    grid();

    ctx.save(); ctx.translate(st.cx,st.cy); ctx.scale(st.s,st.s);
    for(const s of st.segs){
      ctx.lineCap='round'; ctx.strokeStyle='#7b2cff'; ctx.lineWidth=(6*DPR)/st.s;
      ctx.beginPath(); ctx.moveTo(s.a.x,s.a.y); ctx.lineTo(s.b.x,s.b.y); ctx.stroke();
    }
    for(const v of st.valves){
      const A=w2s(v.a), B=w2s(v.b);
      drawValve(ctx,A,B);
    }
    ctx.restore();

    if(st.first){
      const A=w2s(st.first);
      ctx.fillStyle='#16a34a'; ctx.strokeStyle='#fff'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(A.x,A.y,7,0,Math.PI*2); ctx.fill(); ctx.stroke();
      if(st.preview){
        const B=w2s(st.preview);
        ctx.setLineDash([8,8]); ctx.strokeStyle='#16a34a'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  let lastPan=null;
  cv.addEventListener('pointerdown', e=>{
    cv.setPointerCapture?.(e.pointerId);
    const sx=e.clientX*DPR, sy=e.clientY*DPR; const w=s2w(sx,sy);
    if(st.mode==='line'){
      if(!st.first){ st.first=w; st.preview=null; toast('2-я точка'); draw(); }
      else{ st.segs.push({a:st.first,b:w}); st.first=null; st.preview=null; st.mode='idle'; draw(); }
    }
    else if(st.mode==='valve'){
      if(!st.first){ st.first=w; st.preview=null; toast('2-я точка'); draw(); }
      else{ st.valves.push({a:st.first,b:w}); st.first=null; st.preview=null; st.mode='idle'; draw(); }
    }
    else { lastPan={x:sx,y:sy}; }
  });
  cv.addEventListener('pointermove', e=>{
    const sx=e.clientX*DPR, sy=e.clientY*DPR;
    if((st.mode==='line'||st.mode==='valve')&&st.first){
      st.preview=s2w(sx,sy); draw(); return;
    }
    if(lastPan){
      st.cx += sx-lastPan.x; st.cy += sy-lastPan.y; lastPan={x:sx,y:sy}; draw();
    }
  });
  ['pointerup','pointercancel','pointerleave'].forEach(t=>cv.addEventListener(t,()=>{lastPan=null;}));

  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const factor = (e.deltaY<0)?1.06:0.94;
    const sx=e.clientX*DPR, sy=e.clientY*DPR;
    const w=s2w(sx,sy);
    const nextS = Math.max(0.4*DPR, Math.min(4*DPR, st.s*factor));
    st.cx = sx - w.x*nextS; st.cy = sy - w.y*nextS; st.s = nextS; draw();
  }, {passive:false});

  document.querySelector('.bar').addEventListener('click', e=>{
    const act=e.target?.dataset?.act; if(!act) return;
    if(act==='line'){ st.mode='line'; st.first=null; st.preview=null; toast('Линия: 2 тапа'); }
    if(act==='valve'){ st.mode='valve'; st.first=null; st.preview=null; toast('Вентиль: 2 тапа'); }
    if(act==='undo'){ if(st.segs.length) st.segs.pop(); else if(st.valves.length) st.valves.pop(); draw(); }
    if(act==='clear'){ st.segs.length=0; st.valves.length=0; st.first=null; st.preview=null; draw(); }
    if(act==='fit'){ st.s=1*DPR; st.cx=cv.width/2; st.cy=cv.height/2; draw(); }
  });
})();