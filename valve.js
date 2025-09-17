// Библиотека элементов (врезки) с корпусом ровно 10 мм.
// Улучшённый «шаровый вентиль» с выразительной ручкой (евро-обозначение).
// Координаты локальные: ось X вдоль трубы; (0,0) — центр вставки.
(function(){
  const TAU = Math.PI*2;

  function mm(ppm, n){ return n*ppm; }

  function label(ctx, text, ppm){
    ctx.save();
    ctx.font='600 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillStyle='#1f1f2e';
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    ctx.fillText(text, 0, -mm(ppm,0.8));
    ctx.restore();
  }

  function handleStyled(ctx, orientation, ppm){
    // Визуально приятная «ручка-штурвал»: цвет контраста, аккуратные спицы
    ctx.save();
    ctx.lineWidth = Math.max(1, mm(ppm,0.5));
    ctx.strokeStyle = '#1c1c28';
    ctx.fillStyle = orientation==='top' ? '#ff6b6b' : '#ff6b6b';

    if(orientation==='top'){
      // шток вверх
      ctx.beginPath(); ctx.moveTo(0, -mm(ppm,2.6)); ctx.lineTo(0, -mm(ppm,6.2)); ctx.stroke();
      // колёсико
      const R = mm(ppm,2.4);
      ctx.beginPath(); ctx.arc(0, -mm(ppm,6.2), R, 0, TAU); ctx.fill(); ctx.stroke();
      // спицы
      ctx.save(); ctx.translate(0, -mm(ppm,6.2));
      for(let i=0;i<3;i++){
        const a=i*TAU/3;
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(a)*R*0.85, Math.sin(a)*R*0.85);
        ctx.stroke();
      }
      ctx.restore();
    }else{
      // вид «в лицо»: диск
      const R = mm(ppm,2.8);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.stroke();
      // спицы
      for(let i=0;i<3;i++){
        const a=i*TAU/3;
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(a)*R*0.85, Math.sin(a)*R*0.85);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function body10(ctx, ppm, hMm=4){
    const L = mm(ppm,10), H = mm(ppm,hMm);
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1, mm(ppm,0.5));
    ctx.beginPath(); ctx.rect(-L/2, -H/2, L, H); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawBall(ctx, ppm, orientation){
    body10(ctx, ppm, 4);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.5));
    // шар внутри корпуса
    ctx.beginPath(); ctx.arc(0,0, mm(ppm,1.9), 0, TAU); ctx.stroke();
    // короткий шток
    ctx.beginPath(); ctx.moveTo(0, -mm(ppm,1.9)); ctx.lineTo(0, -mm(ppm,3.2)); ctx.stroke();
    ctx.restore();
    handleStyled(ctx, orientation, ppm);
    label(ctx, 'BALL 10mm', ppm);
  }

  function drawGate(ctx, ppm, orientation){
    body10(ctx, ppm, 4);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.5));
    const L = mm(ppm,10), H = mm(ppm,4);
    ctx.beginPath();
    ctx.moveTo(-L*0.22, -H*0.5); ctx.lineTo(0,0); ctx.lineTo(-L*0.22,  H*0.5);
    ctx.moveTo( L*0.22, -H*0.5); ctx.lineTo(0,0); ctx.lineTo( L*0.22,  H*0.5);
    ctx.stroke();
    ctx.restore();
    handleStyled(ctx, orientation, ppm);
    label(ctx, 'GATE 10mm', ppm);
  }

  function drawGlobe(ctx, ppm, orientation){
    body10(ctx, ppm, 4);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.5));
    ctx.beginPath(); ctx.moveTo(-mm(ppm,3),0); ctx.lineTo(mm(ppm,3),0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,-mm(ppm,1.6), mm(ppm,1.6), Math.PI*0.15, Math.PI*0.85); ctx.stroke();
    ctx.restore();
    handleStyled(ctx, orientation, ppm);
    label(ctx, 'GLOBE 10mm', ppm);
  }

  function drawCheck(ctx, ppm){
    body10(ctx, ppm, 4);
    ctx.save(); ctx.strokeStyle
    ='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.5));
    ctx.beginPath();
    ctx.moveTo(-mm(ppm,2.6), -mm(ppm,2));
    ctx.lineTo( mm(ppm,1.6), 0);
    ctx.lineTo(-mm(ppm,2.6),  mm(ppm,2));
    ctx.closePath(); ctx.stroke();
    ctx.restore();
    label(ctx, 'CHECK 10mm', ppm);
  }

  function drawPump(ctx, ppm){
    const L = mm(ppm,10), H = mm(ppm,6);
    ctx.save(); ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1, mm(ppm,0.5));
    ctx.beginPath(); ctx.rect(-L/2, -H/2, L, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0, mm(ppm,2.6), 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-L/2,0); ctx.lineTo(-mm(ppm,2),0); ctx.moveTo(L/2,0); ctx.lineTo(mm(ppm,2),0); ctx.stroke();
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