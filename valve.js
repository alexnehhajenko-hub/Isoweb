// Рисуем вентиль по двум мировым точкам A,B (в пикселях экрана передаём внутр. функцией)
export function drawValveOnScreen(ctx, A, B, dpr) {
  ctx.save();

  // «труба» (короткий отрезок, толщина = 7мм на глаз, визуально заметнее)
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7b2cff';
  ctx.lineWidth = 6 * dpr;
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();

  // Бабочка + ручка
  const ang = Math.atan2(B.y - A.y, B.x - A.x);
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };

  ctx.translate(mid.x, mid.y);
  ctx.rotate(ang);

  const w = 12 * dpr, h = 8 * dpr;      // сам знак
  ctx.fillStyle = '#7b2cff';
  ctx.strokeStyle = '#4a21a8';
  ctx.lineWidth = 1.5 * dpr;

  ctx.beginPath();
  ctx.moveTo(-w * 0.5, 0);
  ctx.lineTo(0, -h * 0.65);
  ctx.lineTo(w * 0.5, 0);
  ctx.lineTo(0, h * 0.65);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // ручка (короткий штрих вверх — читается на горизонтали и на «вертикальных» видно как штрих)
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.moveTo(0, -h * 0.95); ctx.lineTo(0, -h * 1.8); ctx.stroke();

  ctx.restore();
}