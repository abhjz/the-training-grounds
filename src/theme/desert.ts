import type { Palette } from './palettes';
import type { FieldColors } from './engine';

/**
 * Desert look: the colours of a real inland desert flying site on a clear morning
 * (sampled from drone photos of the UAE FPV site: sand #887D72, turf #2E7D1F, asphalt #4B4A48,
 * scrub #2D2A20, haze #8B97A1; brightened a little because the photos were shot dark).
 */
export const DESERT = {
  look: { id: 'desert', name: 'Desert Site' },
  /** UI: warm dark sand-brown panels, cream text, a turf-green accent */
  palette: { id: 'desert', name: 'Desert Site', mood: 'Sand, scrub and turf', base: '#2A241C', support: '#EFE6D6', accent: '#5FB548' } as Palette,
  field: {
    outside: '#6F6556',
    turf: '#B3A58E', // 2D map ground: sand
    border: '#5C5244',
    gridFaint: 'rgba(70, 58, 40, 0.16)',
    gridMajor: 'rgba(70, 58, 40, 0.3)',
    gridAccent: 'rgba(46, 125, 31, 0.35)',
    label: '#4A4134',
    autoPath: '#1D6FE0',
    pillBg: 'rgba(42, 36, 28, 0.9)',
    pillBorder: 'rgba(95, 181, 72, 0.85)',
    pillText: '#D9F2C9',
    sceneBg: '#BFC7CD',
    ground: '#B5A790',
    under: '#8A7C66',
    grid3d: '#9C8E77',
    hemiSky: '#DCE6EE',
    hemiGround: '#8E7F68',
    style: 'desert',
  } as Partial<FieldColors>,
  scene: {
    sky: '#B9C5CE', // pale hazy blue-grey
    fog: '#C3CACE',
  },
};
