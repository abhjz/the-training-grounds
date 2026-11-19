// Animated look: hand-painted wooden dock planks, shared by the 2D canvas and the 3D texture.
// Drawn in field metres, so the caller sets the scale (world transform in 2D, px-per-metre for 3D).

const PLANK_W = 0.6; // metres per plank row
const SHADES = ['#A8714A', '#AD7650', '#A36D47', '#AA734D', '#A56F49'];

/** Small deterministic random so planks look the same on every redraw. */
const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function drawDockPlanks(ctx: CanvasRenderingContext2D, w: number, h: number, seamColor = '#5A3622') {
  ctx.save();
  const rows = Math.ceil(h / PLANK_W);
  for (let r = 0; r < rows; r++) {
    const y = r * PLANK_W;
    const rh = Math.min(PLANK_W, h - y);
    // Each row is a run of planks of 3–6 m, joints staggered row to row
    let x = -rand(r + 0.5) * 4;
    let k = 0;
    while (x < w) {
      const len = 3 + rand(r * 31 + k) * 3;
      const x0 = Math.max(0, x);
      const x1 = Math.min(w, x + len);
      ctx.fillStyle = SHADES[Math.floor(rand(r * 7 + k * 13) * SHADES.length)];
      ctx.fillRect(x0, y, x1 - x0, rh);
      // Soft top highlight and bottom shade give each plank a painted, rounded edge
      ctx.fillStyle = 'rgba(255, 228, 190, 0.16)';
      ctx.fillRect(x0, y, x1 - x0, rh * 0.18);
      ctx.fillStyle = 'rgba(60, 30, 15, 0.18)';
      ctx.fillRect(x0, y + rh * 0.78, x1 - x0, rh * 0.22);
      // A couple of grain streaks
      ctx.strokeStyle = 'rgba(80, 45, 25, 0.14)';
      ctx.lineWidth = 0.025;
      for (let g = 0; g < 2; g++) {
        const gy = y + rh * (0.3 + rand(r * 3 + k + g) * 0.4);
        const gx = x0 + (x1 - x0) * rand(r + k * 5 + g);
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.quadraticCurveTo(gx + 0.8, gy + 0.04, gx + 1.6, gy);
        ctx.stroke();
      }
      // Joint + nails
      if (x1 < w) {
        ctx.fillStyle = seamColor;
        ctx.fillRect(x1 - 0.025, y, 0.05, rh);
        ctx.fillStyle = 'rgba(40, 25, 15, 0.35)';
        for (const nx of [x1 - 0.12, x1 + 0.12]) {
          for (const ny of [y + rh * 0.25, y + rh * 0.75]) {
            ctx.beginPath();
            ctx.arc(nx, ny, 0.035, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      x += len;
      k++;
    }
    // Gap between rows
    ctx.fillStyle = seamColor;
    ctx.fillRect(0, y + rh - 0.035, w, 0.035);
  }
  ctx.restore();
}

/** Water under and around the dock (2D): drop shadow, foam rim and mooring posts. */
export function drawDockSurroundings(ctx: CanvasRenderingContext2D, w: number, h: number, beam: string) {
  ctx.save();
  // Shadow of the dock on the water
  ctx.fillStyle = 'rgba(10, 25, 40, 0.38)';
  ctx.fillRect(0.6, 0.9, w, h);
  // Foam rim
  ctx.strokeStyle = 'rgba(225, 245, 255, 0.35)';
  ctx.lineWidth = 0.35;
  ctx.strokeRect(-0.45, -0.45, w + 0.9, h + 0.9);
  // Mooring posts every ~4 m along the edges
  const post = (px: number, py: number) => {
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.arc(px, py, 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 220, 180, 0.25)';
    ctx.beginPath();
    ctx.arc(px - 0.08, py - 0.08, 0.16, 0, Math.PI * 2);
    ctx.fill();
  };
  const nx = Math.max(2, Math.round(w / 4));
  const ny = Math.max(2, Math.round(h / 4));
  for (let i = 0; i <= nx; i++) {
    post((w * i) / nx, -0.25);
    post((w * i) / nx, h + 0.25);
  }
  for (let j = 1; j < ny; j++) {
    post(-0.25, (h * j) / ny);
    post(w + 0.25, (h * j) / ny);
  }
  ctx.restore();
}
