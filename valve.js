// Библиотека врезаемых элементов: задвижка, клапаны, насос.
// Все элементы рисуются в ЛОКАЛЬНОЙ системе координат:
// ось X совпадает с осью трубы, (0,0) — точка на трубе, где стоит элемент.
// Длина корпуса каждого элемента = ровно 10 мм.
// Ручка: если труба горизонтальна — рисуется «сверху», если вертикальна — «в лицо».
(function(){
  const TAU = Math.PI*2;

  function mm(pxPerMm, n){ return n*pxPerMm; }

  function label(ctx, text){
    ctx.save();
    ctx.font='600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillStyle='#1f1f2e';
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    ctx.fillText(text, 0, -mm(ctx._ppm, 0.8)); // подпись над корпусом
    ctx.restore();
  }

  function drawHandle(ctx, orientation, pxPerMm){
    ctx.save();
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1, mm(pxPerMm,0.5));
    if(orientation==='top'){
      // шток вверх и штурвал
      ctx.beginPath(); ctx.moveTo(0, -mm(pxPerMm,2.5)); ctx.lineTo(0, -mm(pxPerMm,6)); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -mm(pxPerMm,6), mm(pxPerMm,2.2), 0, TAU); ctx.stroke();
    }else{
      // круг "в лицо"
      ctx.beginPath(); ctx.arc(0, 0, mm(pxPerMm,2.6), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // Прямоугольный корпус длиной 10 мм
  function body10(ctx, pxPerMm, heightMm=4){
    const L = mm(pxPerMm, 10), H = mm(pxPerMm, heightMm);
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1, mm(pxPerMm,0.5));
    ctx.beginPath(); ctx.rect(-L/2, -H/2, L, H); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ------------ конкретные элементы ------------
  function drawGate(ctx, pxPerMm, orientation){
    ctx._ppm = pxPerMm;
    body10(ctx, pxPerMm, 4);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(pxPerMm,0.5));
    const L = mm(pxPerMm,10), H = mm(pxPerMm,4);
    // «бабочка» из ISO 14617 для задвижки
    ctx.beginPath();
    ctx.moveTo(-L*0.22, -H*0.5); ctx.lineTo(0,0); ctx.lineTo(-L*0.22,  H*0.5);
    ctx.moveTo( L*0.22, -H*0.5); ctx.lineTo(0,0); ctx.lineTo( L*0.22,  H*0.5);
    ctx.stroke();
    ctx.restore();
    drawHandle(ctx, orientation, pxPerMm);
    label(ctx, 'GATE 10mm');
  }

  function drawBall(ctx, pxPerMm, orientation){
    ctx._ppm = pxPerMm;
    body10(ctx, pxPerMm, 4);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(pxPerMm,0.5));
    ctx.beginPath(); ctx.arc(0,0, mm(pxPerMm,1.8), 0, TAU); ctx.stroke();
    // короткий шток
    ctx.beginPath(); ctx.moveTo(0, -mm(pxPerMm,1.8)); ctx.lineTo(0, -mm(pxPerMm,3.4)); ctx.stroke();
    ctx.restore();
    drawHandle(ctx, orientation, pxPerMm);
    label(ctx, 'BALL 10mm');
  }

  function drawGlobe(ctx, pxPerMm, orientation){
    ctx._ppm = pxPerMm;
    body10(ctx, pxPerMm, 4);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(pxPerMm,0.5));
    // седло + тарелка сверху
    ctx.beginPath(); ctx.moveTo(-mm(pxPerMm,3),0); ctx.lineTo(mm(pxPerMm,3),0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,-mm(pxPerMm,1.6), mm(pxPerMm,1.6), Math.PI*0.15, Math.PI*0.85); ctx.stroke();
    ctx.restore();
    drawHandle(ctx, orientation, pxPerMm);
    label(ctx, 'GLOBE 10mm');
  }

  function drawCheck(ctx, pxPerMm /* no handle */){
    ctx._ppm = pxPerMm;
    body10(ctx, pxPerMm, 4);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(pxPerMm,0.5));
    // тарелка обратного клапана (треугольник)
    ctx.beginPath();
    ctx.moveTo(-mm(pxPerMm,2.6), -mm(pxPerMm,2));
    ctx.lineTo( mm(pxPerMm,1.6), 0);
    ctx.lineTo(-mm(pxPerMm,2.6),  mm(pxPerMm,2));
    ctx.closePath(); ctx.stroke();
    ctx.restore();
    label(ctx, 'CHECK 10mm');
  }

  function drawPump(ctx, pxPerMm){
    ctx._ppm = pxPerMm;
    const L = mm(pxPerMm,10), H = mm(pxPerMm,6);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(pxPerMm,0.5));
    // корпус
    ctx.beginPath(); ctx.rect(-L/2, -H/2, L, H); ctx.stroke();
    // колесо
    ctx.beginPath(); ctx.arc(0,0, mm(pxPerMm,2.6), 0, TAU); ctx.stroke();
    // короткие патрубки
    ctx.beginPath(); ctx.moveTo(-L/2,0); ctx.lineTo(-mm(pxPerMm,2),0);
    ctx.moveTo( L/2,0); ctx.lineTo( mm(pxPerMm,2),0);
    ctx.stroke();
    ctx.restore();
    label(ctx, 'PUMP 10mm');
  }

  window.ValveLib = {
    draw(type, ctx, pxPerMm, orientation){
      switch(type){
        case 'gate':  return drawGate(ctx, pxPerMm, orientation);
        case 'ball':  return drawBall(ctx, pxPerMm, orientation);
        case 'globe': return drawGlobe(ctx, pxPerMm, orientation);
        case 'check': return drawCheck(ctx, pxPerMm);
        case 'pump':  return drawPump(ctx, pxPerMm);
      }
    }
  };
})();