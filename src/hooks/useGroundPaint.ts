import { useMemo, useState } from 'react';
import { GroundMark } from '../types';
import { cachedLogoImage } from '../utils/logos';
import { GroundPaint } from '../utils/watermark';

/** Turns the saved ground mark into what to paint (loading the logo image first). */
export function useGroundPaint(mark: GroundMark, groundName: string): GroundPaint {
  const [loaded, setLoaded] = useState(0);
  const image = mark.mode === 'logo' ? cachedLogoImage(mark.logo, () => setLoaded((n) => n + 1)) : null;
  return useMemo<GroundPaint>(() => {
    const where = { x: mark.x, y: mark.y, scale: mark.scale, rotation: mark.rotation };
    if (mark.mode === 'none') return { text: '', image: null };
    if (mark.mode === 'logo') return { text: '', image, opacity: mark.opacity, ...where };
    // Your own text is meant to be seen: 40% by default (the plain ground name stays a faint watermark)
    if (mark.mode === 'text') return { text: mark.text ?? '', image: null, opacity: mark.opacity ?? 0.4, ...where };
    return { text: groundName, image: null, opacity: mark.opacity, ...where };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark.mode, mark.text, mark.opacity, mark.x, mark.y, mark.scale, mark.rotation, image, groundName, loaded]);
}
