// Элементы (корпус = 10 мм). Компактные силуэты + РЫЧАГ.
// Локальные координаты: X вдоль трубы, (0,0) — центр вставки.
(function(){
  const TAU = Math.PI*2;
  const mm = (ppm, n) => n*ppm;

  function label(ctx, text, ppm){
    ctx.save();
    ctx.font='600 11px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillStyle='#1f1f2e';
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    ctx.fillText(text, 0, -mm(ppm,0.6));
    ctx.restore();
  }
  function roundRect(ctx,x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,  x+w,y+h, rr);
    ctx.arcTo(x+w,y+h,x,  y+h, rr);
    ctx.arcTo(x,  y+h,x,  y,   rr);
    ctx.arcTo(x,  y,  x+w,y,   rr);
    ctx.closePath();
  }
  // Рычаг: top — горизонтальная труба (вид сверху); front — вертикаль (вид «в лицо»)
  function lever(ctx, orientation, ppm){
    ctx.save();
    ctx.lineWidth = Math.max(1, mm(ppm,0.45));
    ctx.strokeStyle = '#1c1c28';
    ctx.fillStyle = '#ff6b6b';
    if(orientation==='top'){
      const stemH = mm(ppm,2.2);
      ctx.beginPath(); ctx.moveTo(0,-mm(ppm,2.0)); ctx.lineTo(0,-mm(ppm,2.0)-stemH); ctx.stroke();
      const w=mm(ppm,5.0), h=mm(ppm,1.2), y=-mm(ppm,2.0)-stemH-h/2, x=-w/2;
      roundRect(ctx,x,y,w,h,mm(ppm,0.5)); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0,0, mm(ppm,1.2), 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  function body10(ctx, ppm, hMm=3.2){
    const L=mm(ppm,10), H=mm(ppm,hMm);
    ctx.save(); ctx.fillStyle='#fff'; ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.45));
    ctx.beginPath(); ctx.rect(-L/2, -H/2, L, H); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  function drawBall(ctx, ppm, orientation){
    body10(ctx, ppm);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.45));
    ctx.beginPath(); ctx.arc(0,0, mm(ppm,1.7), 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-mm(ppm,1.7)); ctx.lineTo(0,-mm(ppm,2.6)); ctx.stroke();
    ctx.restore();
    lever(ctx, orientation, ppm);
    label(ctx, 'BALL 10mm', ppm);
  }
  function drawGate(ctx, ppm, orientation){
    body10(ctx, ppm);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.45));
    const L=mm(ppm,10), H=mm(ppm,3.2);
    ctx.beginPath();
    ctx.moveTo(-L*0.22, -H*0.5); ctx.lineTo(0,0); ctx.lineTo(-L*0.22,  H*0.5);
    ctx.moveTo( L*0.22, -H*0.5); ctx.lineTo(0,0); ctx.lineTo( L*0.22,  H*0.5);
    ctx.stroke(); ctx.restore();
    lever(ctx, orientation, ppm);
    label(ctx, 'GATE 10mm', ppm);
  }
  function drawGlobe(ctx, ppm, orientation){
    body10(ctx, ppm);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.45));
    ctx.beginPath(); ctx.moveTo(-mm(ppm,3),0); ctx.lineTo(mm(ppm,3),0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,-mm(ppm,1.4), mm(ppm,1.4), Math.PI*0.15, Math.PI*0.85); ctx.stroke();
    ctx.restore();
    lever(ctx, orientation, ppm);
    label(ctx, 'GLOBE 10mm', ppm);
  }
  function drawCheck(ctx, ppm){
    body10(ctx, ppm);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.45));
    ctx.beginPath(); ctx.moveTo(-mm(ppm,2.4), -mm(ppm,1.8)); ctx.lineTo( mm(ppm,1.4), 0); ctx.lineTo(-mm(ppm,2.4),  mm(ppm,1.8));
    ctx.closePath(); ctx.stroke(); ctx.restore();
    label(ctx, 'CHECK 10mm', ppm);
  }
  function drawPump(ctx, ppm){
    const L=mm(ppm,10), H=mm(ppm,5.2);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.45));
    ctx.beginPath(); ctx.rect(-L/2, -H/2, L, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0, mm(ppm,2.3), 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-L/2,0); ctx.lineTo(-mm(ppm,2),0);
    ctx.moveTo(L/2,0); ctx.lineTo(mm(ppm,2),0); ctx.stroke();
    ctx.restore();
    label(ctx, 'PUMP 10mm', ppm);
  }

  window.ValveLib = {
    draw(type, ctx, pxPerMm, orientation){
      switch(type){
        case 'ball':  return drawBall(ctx, pxPerMm, orientation);
        case 'gate':  return drawGate(ctx, pxPerMm, orientation);
        case 'globe': return drawGlobe(ctx, pxPerMm, orientation);
        case 'check': return drawCheck(ctx, pxPerMm);
        case 'pump':  return drawPump(ctx, pxPerMm);
      }
    }
  };
})();