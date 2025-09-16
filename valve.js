// Рисование задвижки/вентиля на коротком сегменте трубы.
// Вращается по углу сегмента. Размер подобран под хорошую видимость.

function drawValveSymbol(g, cx, cy, angleRad, sizePx){
  const pipeLen = sizePx;          // длина "кусочка трубы"
  const half = pipeLen/2;
  const thick = Math.max(4, sizePx*0.28);   // толщина трубы (≈7 мм эквивалент)

  g.save();
  g.translate(cx, cy);
  g.rotate(angleRad);

  // трубка (подложка)
  g.lineCap = 'round';
  g.strokeStyle = '#7b2cff';
  g.lineWidth = thick + 2;
  g.globalAlpha = .9;
  g.beginPath();
  g.moveTo(-half, 0);
  g.lineTo( half, 0);
  g.stroke();

  // контрастная обводка символа
  g.globalAlpha = 1;
  g.strokeStyle = '#fff';
  g.lineWidth = Math.max(2, sizePx*0.16);
  g.beginPath();
  g.moveTo(-sizePx*0.22, -sizePx*0.22);
  g.lineTo( sizePx*0.22,  sizePx*0.22);
  g.moveTo(-sizePx*0.22,  sizePx*0.22);
  g.lineTo( sizePx*0.22, -sizePx*0.22);
  g.stroke();

  // сам символ (крест)
  g.strokeStyle = '#2a0a78';
  g.lineWidth = Math.max(3, sizePx*0.20);
  g.beginPath();
  g.moveTo(-sizePx*0.22, -sizePx*0.22);
  g.lineTo( sizePx*0.22,  sizePx*0.22);
  g.moveTo(-sizePx*0.22,  sizePx*0.22);
  g.lineTo( sizePx*0.22, -sizePx*0.22);
  g.stroke();

  // рукоятка (короткая черта)
  // Требование: на горизонтальной трубе — вверх, на вертикальной — «на меня».
  // Горизонтальная ↔ вертикальная решим так:
  // если угол ближе к 0/180 — рисуем рукоятку вверх (по -Y в локальных координатах)
  // если ближе к 90/270 — рисуем маленький штрих «к нам» — имитируем толщиной.
  const deg = Math.abs(((angleRad*180/Math.PI)%180+180)%180); // 0..180
  if (deg < 45 || deg > 135) {
    // почти горизонтальная: рукоятка вверх
    g.strokeStyle = '#2a0a78';
    g.lineWidth = Math.max(3, sizePx*0.18);
    g.beginPath();
    g.moveTo(0, -sizePx*0.55);
    g.lineTo(0, -sizePx*0.28);
    g.stroke();
  } else {
    // почти вертикальная: «штрих к нам» — рисуем небольшое «толстое» пятно
    g.fillStyle = '#2a0a78';
    g.beginPath();
    g.arc(0, -sizePx*0.38, sizePx*0.10, 0, Math.PI*2);
    g.fill();
  }

  g.restore();
}