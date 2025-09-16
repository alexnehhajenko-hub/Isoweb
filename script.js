const canvas = document.getElementById("isoCanvas");
const ctx = canvas.getContext("2d");

// Размер холста под экран
canvas.width = window.innerWidth;
canvas.height = window.innerHeight - 100;

// Координаты начала линии
let startX = null;
let startY = null;
let isDrawing = false;

// Масштаб изометрии
const step = 40;

// Сетка изометрии
function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

// Линия
function startLine(e) {
  isDrawing = true;
  startX = e.offsetX;
  startY = e.offsetY;
}

function drawLine(e) {
  if (!isDrawing) return;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function stopLine() {
  isDrawing = false;
  startX = null;
  startY = null;
}

// Кнопки панели
document.getElementById("lineBtn").onclick = () => {
  canvas.onmousedown = startLine;
  canvas.onmousemove = drawLine;
  canvas.onmouseup = stopLine;
};

document.getElementById("clearBtn").onclick = () => {
  drawGrid();
};

// При старте рисуем сетку
drawGrid();
