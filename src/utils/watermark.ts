/**
 * Draws a ground name centred and large, sized to span most of the area.
 * Shared by the 2D map, the PNG export and the 3D turf texture.
 * Works in any units: pass the area's width/height in the context's current units.
 */
export function drawWatermarkText(
  ctx: CanvasRenderingContext2D,
  name: string,
  width: number,
  height: number,
  fill: string
) {
  const text = name.trim().toUpperCase();
  if (!text) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  // Measure at a reference size, then scale to ~78% of the width, capped by height
  const ref = 100;
  ctx.font = `700 ${ref}px "Chakra Petch", "JetBrains Mono", sans-serif`;
  const measured = ctx.measureText(text).width || 1;
  const size = Math.min((width * 0.78 * ref) / measured, height * 0.22);
  ctx.font = `700 ${size}px "Chakra Petch", "JetBrains Mono", sans-serif`;
  ctx.fillText(text, width / 2, height / 2);
  ctx.restore();
}
