// Рисование «вентиля» на коротком куске трубы: A,B — экранные точки (px)
function drawValveSymbol(ctx, A, B, dpr){
  ctx.save();
  // труба
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7b2cff';
  ctx.lineWidth = 6*dpr;
  ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();

  // «бабочка»
  const ang = Math.atan2(B.y-A.y, B.x-A.x);
  const mid = {x:(A.x+B.x)/2, y:(A.y+B.y)/2};
  ctx.translate(mid.x, mid.y);
  ctx.rotate(ang);

  const w=12*dpr, h=8*dpr;
  ctx.fillStyle='#7b2cff';
  ctx.strokeStyle='#4a21a8';
  ctx.lineWidth=1.5*dpr;

  ctx.beginPath();
  ctx.moveTo(-w*0.52,0);
  ctx.lineTo(0,-h*0.70);
  ctx.lineTo(w*0.52,0);
  ctx.lineTo(0,h*0.70);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // ручка (короткий штрих «вверх» на горизонталях)
  ctx.strokeStyle='#0e1322';
  ctx.lineWidth=2*dpr;
  ctx.beginPath(); ctx.moveTo(0,-h*0.95); ctx.lineTo(0,-h*1.8); ctx.stroke();

  ctx.restore();
}