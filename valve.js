// Примитив «вентиль» 10×7 мм условно в экранных пикселях
// Размер в px привязан к DPI устройства через DPR
function drawValve(ctx, A, B, dpr) {
  // сегмент трубы (фиолетовый) – короткий
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7b2cff';
  ctx.lineWidth = 6 * dpr;

  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(B.x, B.y);
  ctx.stroke();

  // «бабочка» (затвор) и ручка
  const ang = Math.atan2(B.y - A.y, B.x - A.x);
  const mid = { x: (A.x+B.x)/2, y: (A.y+B.y)/2 };

  // бабочка
  ctx.translate(mid.x, mid.y);
  ctx.rotate(ang);
  ctx.fillStyle = '#7b2cff';
  ctx.strokeStyle = '#4500b0';
  ctx.lineWidth = 1.5 * dpr;

  const w = 12 * dpr, h = 8 * dpr;
  ctx.beginPath();
  ctx.moveTo(-w*0.5, 0);
  ctx.lineTo(0, -h*0.6);
  ctx.lineTo(w*0.5, 0);
  ctx.lineTo(0, h*0.6);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // ручка: на горизонталях смотрит вверх, на вертикалях — «на нас»
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2 * dpr;
  // короткий штрих-рычаг
  ctx.beginPath();
  ctx.moveTo(0, -h*0.9);
  ctx.lineTo(0, -h*1.8);
  ctx.stroke();

  ctx.restore();
}