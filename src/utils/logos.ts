/**
 * Logos people put on flags, container walls and the ground.
 * Stored as small data URLs inside the track itself, so they travel with saved and exported tracks.
 */

/** Longest side of a stored logo. Big enough to look sharp on a container wall, small enough for autosave. */
const MAX_LOGO_PX = 512;

/** Reads an image file and shrinks it to a compact data URL (keeps transparency). */
export async function fileToLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file (PNG, JPG, SVG or WebP).');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, MAX_LOGO_PX / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width || MAX_LOGO_PX) * k));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height || MAX_LOGO_PX) * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    // WebP keeps transparency at a fraction of PNG's size; fall back to PNG where it isn't supported
    const webp = canvas.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}

const imageCache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

/** Already-loaded image for a logo, or null (and starts loading it). */
export function cachedLogoImage(src: string | undefined, onReady?: () => void): HTMLImageElement | null {
  if (!src) return null;
  const hit = imageCache.get(src);
  if (hit) return hit;
  let p = pending.get(src);
  if (!p) {
    p = loadImage(src).then((img) => {
      imageCache.set(src, img);
      pending.delete(src);
      return img;
    });
    pending.set(src, p);
  }
  if (onReady) p.then(onReady, () => {});
  return null;
}

/** Draws an image centred in a box, as large as fits without stretching. */
export function drawContained(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  boxW: number,
  boxH: number
) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const k = Math.min(boxW / iw, boxH / ih);
  ctx.drawImage(img, cx - (iw * k) / 2, cy - (ih * k) / 2, iw * k, ih * k);
}

/** Where a logo can go on an item. */
export type LogoSlot = 'flag' | 'left' | 'right' | 'roof' | 'leftIn' | 'rightIn' | 'ceiling';
