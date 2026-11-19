// Turns a 60·30·10 palette into a full app theme:
//  - CSS variables that recolour Tailwind's slate (neutrals) and sky/cyan (accent) scales,
//  - colours for the 2D field canvas and the 3D scene.
// Every text colour is checked against the background it sits on (WCAG contrast) and pushed
// lighter/darker until it is readable, so palettes with mid-tone bases stay usable.

import { DEFAULT_THEME_ID, PALETTES, Palette } from './palettes';
import { TW } from './tailwindColors';
import { COASTAL_SUNSET } from './coastalSunset';
import { SHOWROOM } from './showroom';
import { TRADING_FLOOR } from './tradingFloor';

// ---------------------------------------------------------------- colour maths
type RGB = [number, number, number];
const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as RGB;
};
const toHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return toHex([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t) as RGB);
};
export const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Move `color` toward white (or black) in small steps until it reaches `min` contrast on `bg`. */
const ensureContrast = (color: string, bg: string, min: number, toward: '#ffffff' | '#000000') => {
  let c = color;
  for (let t = 0.04; contrast(c, bg) < min && t <= 1; t += 0.04) c = mix(color, toward, t);
  return c;
};

const BLACK = '#000000';
const WHITE = '#ffffff';
const NEAR_BLACK = '#0a0a0a';
const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
// Families recoloured only in light themes (light text tints flip to dark shades and vice versa)
const SEMANTIC = ['emerald', 'amber', 'rose', 'red', 'purple', 'violet', 'yellow', 'orange', 'blue', 'fuchsia'];

// ---------------------------------------------------------------- theme shape
export interface FieldColors {
  outside: string; // 2D: around the field
  turf: string; // 2D field surface
  border: string;
  gridFaint: string;
  gridMajor: string;
  gridAccent: string;
  label: string; // axis labels
  autoPath: string; // auto race line (gate to gate)
  pillBg: string; // distance labels
  pillBorder: string;
  pillText: string;
  sceneBg: string; // 3D background + fog
  ground: string; // 3D turf
  under: string; // 3D slab under the field
  grid3d: string;
  hemiSky: string;
  hemiGround: string;
  /** Scene treatment for 2D and 3D fields. */
  style?: 'flat' | 'dock' | 'coast' | 'showroom' | 'trading';
  /** Animated look only */
  water?: string;
  waterDeep?: string;
  wood?: string;
  woodDark?: string;
  fence?: string;
}

export type Look = 'normal' | 'animated' | 'sunset' | 'showroom' | 'trading';

export interface Theme {
  id: string;
  look?: Look;
  name: string;
  isLight: boolean;
  /** CSS custom properties to set on :root (empty for the original look) */
  vars: Record<string, string>;
  field: FieldColors;
  /** browser / Android status bar colour */
  chrome: string;
}

const CLASSIC_FIELD: FieldColors = {
  outside: '#080c14',
  turf: '#0f172a',
  border: '#334155',
  gridFaint: 'rgba(71, 85, 105, 0.25)',
  gridMajor: 'rgba(100, 116, 139, 0.45)',
  gridAccent: 'rgba(56, 189, 248, 0.2)',
  label: '#64748b',
  autoPath: '#22d3ee',
  pillBg: 'rgba(15, 23, 42, 0.92)',
  pillBorder: 'rgba(56, 189, 248, 0.8)',
  pillText: '#38bdf8',
  sceneBg: '#070a12',
  ground: '#0f1c1a',
  under: '#05080e',
  grid3d: '#1f3b3a',
  hemiSky: '#bae6fd',
  hemiGround: '#0f172a',
};

// ---------------------------------------------------------------- builder
export function buildTheme(p: Palette): Theme {
  if (p.id === DEFAULT_THEME_ID) {
    return { id: p.id, name: p.name, isLight: false, vars: {}, field: CLASSIC_FIELD, chrome: '#090d16' };
  }

  // Light theme when dark text reads better on the base than white does (e.g. Sky Fresh)
  const isLight = contrast(p.base, NEAR_BLACK) >= 9;

  // 60% background. Mid-tone bases (mauve, olive, brick) are deepened until white text is
  // clearly readable; the hue stays the palette's own.
  let bg: string;
  let fg: string;
  if (isLight) {
    bg = mix(p.base, WHITE, 0.4);
    fg = ensureContrast(mix(p.base, BLACK, 0.82), bg, 9, BLACK);
  } else {
    bg = p.base;
    for (let t = 0.05; contrast(WHITE, bg) < 11 && t < 0.95; t += 0.05) bg = mix(p.base, BLACK, t);
    // 30% support becomes the text colour when it is readable enough, otherwise white
    fg = contrast(p.support, bg) >= 7 ? p.support : WHITE;
  }
  const away = isLight ? WHITE : BLACK; // direction "behind" the background
  const deep = mix(bg, away, isLight ? 0.55 : 0.35);

  // Neutral scale (Tailwind "slate"): 950/900 are surfaces, 50 is the text colour.
  const t: Record<string, number> = { '800': 0.09, '700': 0.17, '600': 0.3, '500': 0.47, '400': 0.62, '300': 0.76, '200': 0.87, '100': 0.94 };
  const slate: Record<string, string> = { '950': deep, '900': bg, '50': fg };
  for (const [step, k] of Object.entries(t)) slate[step] = mix(bg, fg, k);
  // Muted text must stay readable on the background
  const towardFg = isLight ? BLACK : WHITE;
  slate['500'] = ensureContrast(slate['500'], bg, 3.6, towardFg);
  slate['400'] = ensureContrast(slate['400'], bg, 6.4, towardFg); // stays ≥4.5 on cards (800) too
  slate['300'] = ensureContrast(slate['300'], bg, 8, towardFg);

  // 10% accent scale (Tailwind "sky" and "cyan")
  const accent: Record<string, string> = {};
  if (isLight) {
    // On a light background the accent must be deep enough for text, and white text must read on it
    const a = ensureContrast(ensureContrast(p.accent, bg, 4.6, BLACK), WHITE, 4.6, BLACK);
    Object.assign(accent, {
      '50': mix(a, BLACK, 0.45), '100': mix(a, BLACK, 0.38), '200': mix(a, BLACK, 0.3), '300': mix(a, BLACK, 0.2), '400': mix(a, BLACK, 0.1),
      '500': a, '600': a, '700': mix(a, WHITE, 0.5), '800': mix(a, WHITE, 0.7), '900': mix(a, WHITE, 0.82), '950': mix(a, WHITE, 0.9),
    });
  } else {
    const a = ensureContrast(p.accent, bg, 3.2, WHITE);
    Object.assign(accent, {
      '50': mix(a, WHITE, 0.92), '100': mix(a, WHITE, 0.82), '200': mix(a, WHITE, 0.65), '300': mix(a, WHITE, 0.42), '400': mix(a, WHITE, 0.2),
      '500': a, '600': mix(a, BLACK, 0.16), '700': mix(a, BLACK, 0.33), '800': mix(a, BLACK, 0.5), '900': mix(a, BLACK, 0.66), '950': mix(a, BLACK, 0.8),
    });
    accent['300'] = ensureContrast(accent['300'], bg, 7, WHITE);
    accent['400'] = ensureContrast(accent['400'], bg, 5, WHITE);
    // Filled buttons (600) carry white text: bright neons (green, cyan, yellow) get a deeper shade
    accent['600'] = ensureContrast(accent['600'], WHITE, 4.5, BLACK);
  }

  const vars: Record<string, string> = {};
  for (const s of STEPS) {
    vars[`--color-slate-${s}`] = slate[s];
    vars[`--color-sky-${s}`] = accent[s];
    vars[`--color-cyan-${s}`] = accent[s];
  }
  // App surfaces that used fixed hex values
  vars['--color-tg-panel'] = mix(bg, deep, 0.5);
  vars['--color-tg-deep'] = deep;

  // Light themes: flip the coloured status scales (green/amber/red/purple…) so light text tints
  // become dark shades and dark badge backgrounds become light tints.
  if (isLight) {
    for (const fam of SEMANTIC) {
      const scale = TW[fam];
      if (!scale) continue;
      const flip: Record<string, string> = { '50': '950', '100': '900', '200': '800', '300': '700', '400': '600', '600': '400', '700': '300', '800': '200', '900': '100', '950': '50' };
      for (const [from, to] of Object.entries(flip)) {
        if (!scale[to]) continue;
        // Text tints (200–400) must stay readable on the light background
        const isText = from === '200' || from === '300' || from === '400';
        vars[`--color-${fam}-${from}`] = isText ? ensureContrast(scale[to], bg, 4.6, BLACK) : scale[to];
      }
    }
  }

  // Field: always a dark "night turf" so gates and lines stay visible, tinted with the base hue
  const fBg = isLight ? mix(p.base, BLACK, 0.8) : bg;
  const fFg = isLight ? WHITE : fg;
  const fAccent = isLight ? ensureContrast(p.accent, fBg, 4.5, WHITE) : accent['400'];
  const turf = mix(fBg, fFg, 0.04);
  const field: FieldColors = {
    outside: mix(fBg, BLACK, 0.4),
    turf,
    border: mix(fBg, fFg, 0.24),
    gridFaint: rgba(mix(fBg, fFg, 0.35), 0.25),
    gridMajor: rgba(mix(fBg, fFg, 0.5), 0.45),
    gridAccent: rgba(fAccent, 0.2),
    label: ensureContrast(mix(fBg, fFg, 0.45), mix(fBg, BLACK, 0.4), 3.5, WHITE),
    autoPath: fAccent,
    pillBg: rgba(mix(fBg, BLACK, 0.2), 0.92),
    pillBorder: rgba(fAccent, 0.8),
    pillText: ensureContrast(fAccent, mix(fBg, BLACK, 0.2), 4.5, WHITE),
    sceneBg: mix(fBg, BLACK, 0.45),
    ground: turf,
    under: mix(fBg, BLACK, 0.65),
    grid3d: mix(turf, fAccent, 0.2),
    hemiSky: mix(fAccent, WHITE, 0.6),
    hemiGround: fBg,
  };

  return { id: p.id, name: p.name, isLight, vars, field, chrome: vars['--color-tg-panel'] };
}

// ---------------------------------------------------------------- Animated look
// Deep sea navy (60), soft white (30), lantern amber (10) for the interface; the field is a
// mossy wooden deck. In 3D it sits on a drowned tower in a sunken city (SunkenScene.tsx).
// The colour palette picker applies to the normal look only.
export const ANIMATED_PALETTE: Palette = {
  id: 'animated',
  name: 'Animated',
  mood: 'Sunken city',
  base: '#1E2A44',
  support: '#F2F2F5',
  accent: '#F5A21B',
};

function buildAnimatedTheme(): Theme {
  const t = buildTheme(ANIMATED_PALETTE);
  const amber = '#FFC23D';
  t.vars['--color-tg-panel'] = '#1B2540';
  t.vars['--color-tg-deep'] = '#141C33';
  t.field = {
    ...t.field,
    style: 'dock',
    outside: '#0F4C55',
    turf: '#A8714A',
    border: '#4A2E1E',
    gridFaint: 'rgba(255, 240, 220, 0.10)',
    gridMajor: 'rgba(255, 240, 220, 0.26)',
    gridAccent: 'rgba(255, 194, 61, 0.45)',
    label: '#F2F2F5',
    autoPath: amber,
    pillBg: 'rgba(38, 44, 62, 0.9)',
    pillBorder: 'rgba(220, 226, 240, 0.85)',
    pillText: '#FFFFFF',
    sceneBg: '#0F4C55',
    ground: '#A8714A',
    under: '#3B2418',
    grid3d: '#7A4E32',
    hemiSky: '#E6E2F2',
    hemiGround: '#2C5674',
    water: '#2F86A8',
    waterDeep: '#174A6A',
    wood: '#A8714A',
    woodDark: '#6B4128',
    fence: '#F2E6CF',
  };
  return { ...t, id: 'animated', name: 'Animated', look: 'animated', chrome: '#1B2540' };
}

function buildSunsetTheme(): Theme {
  const { palette, ui, field, look } = COASTAL_SUNSET;
  const t = buildTheme(palette);
  t.vars['--color-tg-panel'] = ui.panel;
  t.vars['--color-tg-deep'] = ui.deep;
  t.vars['--tg-sunset-horizon'] = ui.horizon;
  t.vars['--tg-sunset-water'] = ui.water;
  t.vars['--tg-sunset-water-deep'] = ui.waterDeep;
  t.vars['--tg-sunset-glow'] = ui.glow;
  t.vars['--tg-sunset-sky-top'] = COASTAL_SUNSET.scene.sky[0];
  t.vars['--tg-sunset-sky-mid'] = COASTAL_SUNSET.scene.sky[2];
  return { ...t, id: look.id, name: look.name, look: 'sunset', field, chrome: ui.panel };
}

/** Showroom look: white and grey with one blue (src/theme/showroom.ts). */
function buildShowroomTheme(): Theme {
  const { palette, ui, field, look } = SHOWROOM;
  const t = buildTheme(palette);
  // Exact grey text scale instead of the generated one
  const slate: Record<string, string> = {
    '50': ui.carbon, '100': ui.carbon, '200': ui.graphite, '300': ui.graphite, '400': ui.pewter,
    '500': ui.silver, '600': '#B5B6B8', '700': ui.paleSilver, '800': ui.cloud, '900': ui.white, '950': ui.ash,
  };
  for (const [step, v] of Object.entries(slate)) t.vars[`--color-slate-${step}`] = v;
  // One blue: filled buttons use it as is, text and borders use it too
  for (const fam of ['sky', 'cyan']) {
    t.vars[`--color-${fam}-500`] = ui.blue;
    t.vars[`--color-${fam}-600`] = ui.blue;
    t.vars[`--color-${fam}-400`] = ui.blue;
    t.vars[`--color-${fam}-300`] = ui.blueHover;
    t.vars[`--color-${fam}-200`] = ui.blueHover;
  }
  // Monochrome plus one: amber, orange and yellow accents become the same blue
  const blueScale: Record<string, string> = {
    '50': '#EEF2FC', '100': '#DCE5FA', '200': ui.blueHover, '300': ui.blueHover, '400': ui.blue,
    '500': ui.blue, '600': ui.blue, '700': '#B7C8F3', '800': '#DCE5FA', '900': '#EEF2FC', '950': '#F6F8FE',
  };
  for (const fam of ['amber', 'orange', 'yellow'])
    for (const [step, v] of Object.entries(blueScale)) t.vars[`--color-${fam}-${step}`] = v;
  t.vars['--color-tg-panel'] = ui.white;
  t.vars['--color-tg-deep'] = ui.ash;
  return { ...t, id: look.id, name: look.name, isLight: true, look: 'showroom', field: { ...t.field, ...field }, chrome: ui.white };
}

/** Trading Floor look: near-black, one yellow, green / red signals (src/theme/tradingFloor.ts). */
function buildTradingTheme(): Theme {
  const { palette, ui, field, look } = TRADING_FLOOR;
  const t = buildTheme(palette);
  const set = (fam: string, scale: Record<string, string>) => {
    for (const [step, v] of Object.entries(scale)) t.vars[`--color-${fam}-${step}`] = v;
  };
  // Neutrals: canvas, cards one step up, hairlines that read as surface steps
  set('slate', {
    '950': ui.canvas, '900': ui.card, '800': ui.elevated, '700': ui.elevated, '600': '#474D57',
    '500': ui.muted, '400': ui.mutedStrong, '300': '#B7BDC6', '200': ui.body, '100': ui.body, '50': '#FFFFFF',
  });
  // The one accent: yellow (also absorbs amber / orange so there is no second brand colour)
  const yellow = {
    '50': '#FFF9DB', '100': '#FEF1B0', '200': ui.yellow, '300': ui.yellow, '400': ui.yellow, '500': ui.yellow,
    '600': ui.yellow, '700': ui.yellowActive, '800': '#5C4D10', '900': '#3A3A1F', '950': '#24220F',
  };
  for (const fam of ['sky', 'cyan', 'amber', 'yellow', 'orange']) set(fam, yellow);
  // Trading signals
  const green = { '50': '#E6FBF2', '100': '#B5F1D8', '200': '#6FE3B4', '300': ui.up, '400': ui.up, '500': ui.up, '600': '#0AA86A', '700': '#087F51', '800': '#0D5238', '900': '#0A3A28', '950': '#06261A' };
  const red = { '50': '#FEECEE', '100': '#FCC3CA', '200': '#FA8A98', '300': ui.down, '400': ui.down, '500': ui.down, '600': '#D63A4F', '700': '#A62D3E', '800': '#5A1F28', '900': '#3A161C', '950': '#25100F' };
  set('emerald', green);
  set('green', green);
  set('rose', red);
  set('red', red);
  t.vars['--color-tg-panel'] = ui.ink;
  t.vars['--color-tg-deep'] = ui.canvas;
  return { ...t, id: look.id, name: look.name, isLight: false, look: 'trading', field: { ...t.field, ...field }, chrome: ui.canvas };
}

// ---------------------------------------------------------------- current theme
const STORAGE_KEY = 'training_grounds_theme';
const LOOK_KEY = 'training_grounds_look';
let currentLook: Look = 'normal';
let currentPaletteId = DEFAULT_THEME_ID;

export function loadLook(): Look {
  try {
    const saved = localStorage.getItem(LOOK_KEY);
    if (saved === 'animated' || saved === 'sunset' || saved === 'showroom' || saved === 'trading') return saved;
  } catch {}
  return 'normal';
}
export const currentLookId = () => currentLook;
let current: Theme = buildTheme(PALETTES[0]);

/** Colours for code that draws directly (2D canvas). */
export const fieldColors = () => current.field;
export const currentTheme = () => current;

export function loadThemeId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && PALETTES.some((p) => p.id === id)) return id;
  } catch {}
  return DEFAULT_THEME_ID;
}

let appliedVars: string[] = [];
/** Apply a theme to the page and remember it. */
export function applyTheme(id: string, look: Look = currentLook): Theme {
  const palette = PALETTES.find((p) => p.id === id) ?? PALETTES[0];
  currentPaletteId = palette.id;
  currentLook = look;
  current =
    look === 'animated'
      ? buildAnimatedTheme()
      : look === 'sunset'
      ? buildSunsetTheme()
      : look === 'showroom'
      ? buildShowroomTheme()
      : look === 'trading'
      ? buildTradingTheme()
      : { ...buildTheme(palette), look: 'normal' };
  const root = document.documentElement;
  for (const name of appliedVars) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(current.vars)) root.style.setProperty(name, value);
  appliedVars = Object.keys(current.vars);
  root.dataset.theme = current.id;
  root.dataset.look = look;
  root.style.colorScheme = current.isLight ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', current.chrome);
  try {
    localStorage.setItem(STORAGE_KEY, currentPaletteId);
    localStorage.setItem(LOOK_KEY, look);
  } catch {}
  return current;
}

/** Switch between the normal look and the Animated look, keeping the chosen colour palette. */
export const applyLook = (look: Look) => applyTheme(currentPaletteId, look);
