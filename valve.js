function drawValve(ctx, x, y) {
  // Рисуем кусок трубы (10 мм длина, 7 мм толщина → масштаб 40px = 10 мм)
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(x - 20, y); // левая часть трубы
  ctx.lineTo(x + 20, y); // правая часть трубы
  ctx.stroke();

  // Символ вентиля (крест внутри трубы)
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 10);
  ctx.lineTo(x + 10, y + 10);
  ctx.moveTo(x + 10, y - 10);
  ctx.lineTo(x - 10, y + 10);
  ctx.stroke();

  // Ручка сверху (маленький рычаг)
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x, y - 25);
  ctx.stroke();
}

// Тест кнопки "Символы"
document.getElementById("symbolBtn").onclick = () => {
  const canvas = document.getElementById("isoCanvas");
  const ctx = canvas.getContext("2d");

  // Нарисовать вентиль в центре холста
  drawValve(ctx, canvas.width / 2, canvas.height / 2);
};
