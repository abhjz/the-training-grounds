import { drawContained } from './logos';

/** What to paint across the ground: some text, or a logo image. */
export interface GroundPaint {
  text: string;
  image: HTMLImageElement | null;
  /** 0.05 to 1; undefined = the look's own faint watermark (text) or 0.6 (logo) */
  opacity?: number;
  /** Centre as a share of the area (0..1); undefined = the middle */
  x?: number;
  y?: number;
  /** 1 = the normal size */
  scale?: number;
  /** Degrees, clockwise */
  rotation?: number;
}
export type GroundMarkSource = string | GroundPaint;

// The current ground paint, for the 2D map and the PNG export (they read it at draw time)
let activePaint: GroundPaint | null = null;
export const setActiveGroundPaint = (p: GroundPaint | null) => {
  activePaint = p;
};
export const activeGroundPaint = () => activePaint;

/** Is there anything to paint? */
export const hasGroundMark = (m: GroundMarkSource) => (typeof m === 'string' ? !!m.trim() : !!m.image || !!m.text.trim());

/** Scales the alpha of an rgba() colour (text opacity 0.1 = the look's normal watermark strength). */
function withOpacity(fill: string, opacity: number | undefined) {
  if (opacity === undefined) return fill;
  const m = /^rgba\(([^,]+),([^,]+),([^,]+),\s*([\d.]+)\s*\)$/.exec(fill.replace(/\s+/g, ' ').trim());
  if (!m) return fill;
  const a = Math.min(1, (Number(m[4]) * opacity) / 0.1);
  return `rgba(${m[1]},${m[2]},${m[3]}, ${a.toFixed(3)})`;
}

/**
 * Draws the ground mark centred and large, sized to span most of the area: a name or your own text,
 * or a logo. Shared by the 2D map, the PNG export and every 3D look's ground texture.
 * Works in any units: pass the area's width/height in the context's current units.
 */
export function drawWatermarkText(ctx: CanvasRenderingContext2D, mark: GroundMarkSource, width: number, height: number, fill: string) {
  const paint: GroundPaint = typeof mark === 'string' ? { text: mark, image: null } : mark;
  const k = paint.scale ?? 1;
  // Move to where the mark sits (a share of the area, so it lands on the same spot in 2D, 3D and exports)
  const place = () => {
    ctx.translate(width * (paint.x ?? 0.5), height * (paint.y ?? 0.5));
    if (paint.rotation) ctx.rotate((paint.rotation * Math.PI) / 180);
  };
  if (paint.image) {
    ctx.save();
    ctx.globalAlpha = paint.opacity ?? 0.6;
    place();
    drawContained(ctx, paint.image, 0, 0, width * 0.62 * k, height * 0.62 * k);
    ctx.restore();
    return;
  }
  const text = paint.text.trim().toUpperCase();
  if (!text) return;
  ctx.save();
  place();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Measure at a reference size, then scale to ~78% of the width, capped by height
  const ref = 100;
  ctx.font = `700 ${ref}px "Chakra Petch", "JetBrains Mono", sans-serif`;
  const measured = ctx.measureText(text).width || 1;
  const size = Math.min((width * 0.78 * ref) / measured, height * 0.22) * k;
  ctx.font = `700 ${size}px "Chakra Petch", "JetBrains Mono", sans-serif`;
  const color = withOpacity(fill, paint.opacity);
  // A thin edge in the opposite tone keeps the writing readable on any ground (sand, turf, asphalt, grass)
  const m = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)/.exec(color);
  if (m) {
    const light = Number(m[1]) + Number(m[2]) + Number(m[3]) > 382;
    const a = Math.min(1, Number(m[4]) * 1.1);
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.045;
    ctx.strokeStyle = light ? `rgba(20, 18, 14, ${a.toFixed(3)})` : `rgba(255, 252, 245, ${a.toFixed(3)})`;
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
