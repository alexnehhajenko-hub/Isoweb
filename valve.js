// рисуем вентиль по двум экранным точкам A,B (экраные px), dpr — devicePixelRatio
function drawValve(ctx, A, B, dpr){
  ctx.save();
  // короткий кусок трубы
  ctx.lineCap='round';
  ctx.strokeStyle='#7b2cff';
  ctx.lineWidth=6*dpr;
  ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();

  // «бабочка» и ручка
  const ang=Math.atan2(B.y-A.y, B.x-A.x);
  const mid={x:(A.x+B.x)/2, y:(A.y+B.y)/2};
  ctx.translate(mid.x, mid.y);
  ctx.rotate(ang);

  const w=12*dpr, h=8*dpr;
  ctx.fillStyle='#7b2cff';
  ctx.strokeStyle='#4a21a8';
  ctx.lineWidth=1.5*dpr;

  ctx.beginPath();
  ctx.moveTo(-w*0.5,0);
  ctx.lineTo(0,-h*0.65);
  ctx.lineTo(w*0.5,0);
  ctx.lineTo(0,h*0.65);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // ручка (штрих вверх на горизонталях, на вертикалях воспринимается как «на камеру»)
  ctx.strokeStyle='#111';
  ctx.lineWidth=2*dpr;
  ctx.beginPath(); ctx.moveTo(0,-h*0.95); ctx.lineTo(0,-h*1.8); ctx.stroke();

  ctx.restore();
}