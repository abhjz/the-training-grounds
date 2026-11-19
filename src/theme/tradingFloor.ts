/**
 * Trading Floor look: a confident trading-platform style. Near-black canvas, flat card surfaces
 * one step lighter, hairlines that read as surface steps, one yellow for primary actions and the
 * race line (always with black text), trading green / red only as up / down signals.
 * In 3D the field sits on a dark floor ringed by candlestick columns that rise and fall.
 */
export const TRADING_FLOOR = {
  look: { id: 'trading', name: 'Trading Floor' },
  palette: { id: 'trading', name: 'Trading Floor', mood: 'Near-black, one yellow', base: '#0B0E11', support: '#EAECEF', accent: '#FCD535' },
  ui: {
    canvas: '#0B0E11',
    ink: '#181A20',
    card: '#1E2329',
    elevated: '#2B3139', // also the hairline colour
    body: '#EAECEF',
    muted: '#707A8A',
    mutedStrong: '#929AA5',
    yellow: '#FCD535',
    yellowActive: '#F0B90B',
    up: '#0ECB81',
    down: '#F6465D',
  },
  field: {
    style: 'trading' as const,
    outside: '#0B0E11',
    turf: '#181A20',
    border: '#2B3139',
    gridFaint: 'rgba(43, 49, 57, 0.55)',
    gridMajor: 'rgba(71, 77, 87, 0.75)',
    gridAccent: 'rgba(252, 213, 53, 0.25)',
    label: '#707A8A',
    autoPath: '#FCD535',
    pillBg: 'rgba(30, 35, 41, 0.95)',
    pillBorder: 'rgba(252, 213, 53, 0.85)',
    pillText: '#FCD535',
    sceneBg: '#0B0E11',
    ground: '#1E2329',
    under: '#0B0E11',
    grid3d: '#2B3139',
    hemiSky: '#EAECEF',
    hemiGround: '#0B0E11',
    fence: '#707A8A',
  },
} as const;
