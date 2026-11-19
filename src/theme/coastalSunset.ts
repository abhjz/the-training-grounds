/**
 * Coastal Sunset design tokens. The saved IDs ('vice-sunset', 'sunset') are internal and kept
 * stable so existing palette and look selections keep loading after the name change.
 * The colours and motion values are shared by the UI, 2D map, and 3D scene.
 */
export const COASTAL_SUNSET = {
  palette: {
    id: 'vice-sunset',
    name: 'Coastal Sunset',
    mood: 'Coastal dusk · neon pink',
    base: '#172039',
    support: '#FFF1E8',
    accent: '#FF69A9',
  },
  look: { id: 'sunset', name: 'Coastal Sunset' },
  ui: {
    panel: '#1E233D',
    deep: '#10172D',
    horizon: '#FFB070',
    water: '#2E8091',
    waterDeep: '#173E64',
    glow: '#FF80BA',
  },
  field: {
    style: 'coast' as const,
    outside: '#203B56',
    turf: '#303B50',
    border: '#F5A88F',
    gridFaint: 'rgba(255, 210, 211, 0.13)',
    gridMajor: 'rgba(255, 191, 190, 0.26)',
    gridAccent: 'rgba(255, 97, 174, 0.28)',
    label: '#ffd2da',
    autoPath: '#ff69b5',
    pillBg: 'rgba(37, 20, 47, 0.94)',
    pillBorder: 'rgba(255, 129, 180, 0.9)',
    pillText: '#ffe1ee',
    sceneBg: '#48547D',
    ground: '#35435B',
    under: '#152A47',
    grid3d: '#8B7898',
    hemiSky: '#ffd3a4',
    hemiGround: '#213955',
    water: '#2E8091',
    waterDeep: '#173E64',
    fence: '#ffb566',
  },
  scene: {
    fog: '#F0A08A',
    sun: '#FFE0A5',
    sky: ['#212C6B', '#6A4C9C', '#E0569B', '#FF8A5B', '#FFC76B'],
    tarmac: ['#4B5063', '#30384F', '#202A40'],
    palm: ['#1C2B40', '#2A3850'],
    skyline: ['#626783', '#515F7E', '#776984', '#4B5878'],
    /** Pastel art deco walls along the drive */
    deco: ['#F6B6C8', '#9FE3D6', '#FFD9A8', '#C9B6F2', '#FFF1DE', '#7FD3E6'],
    /** Neon trim and signs */
    neon: ['#FF3FA4', '#3FF2FF', '#B36BFF', '#FFB13F'],
    windows: ['#FFD4A3', '#FFD993', '#79C8D5'],
  },
  motion: {
    palmSway: 0.16,
    boatSpeed: 2.7,
    birdSpeed: 1.6,
    waterDriftX: 0.003,
    waterDriftY: 0.006,
  },
} as const;
