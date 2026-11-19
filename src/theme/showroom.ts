/**
 * Showroom look: a minimal, product-first style. White surfaces, a carbon-dark grey text
 * scale, one electric blue used only for primary actions and the race line, no shadows or
 * gradients, barely rounded corners. In 3D the field is polished concrete under a hazy city sky.
 */
export const SHOWROOM = {
  look: { id: 'showroom', name: 'Showroom' },
  palette: { id: 'showroom', name: 'Showroom', mood: 'White, minimal, one blue', base: '#FFFFFF', support: '#171A20', accent: '#3E6AE1' },
  ui: {
    white: '#FFFFFF',
    ash: '#F4F4F4', // alternate surface
    carbon: '#171A20', // headings, primary text
    graphite: '#393C41', // body text
    pewter: '#5C5E62', // tertiary text
    silver: '#8E8E8E', // placeholder, disabled
    cloud: '#EEEEEE', // light dividers
    paleSilver: '#D0D1D2', // borders
    blue: '#3E6AE1',
    blueHover: '#3457B1',
    frost: 'rgba(255, 255, 255, 0.75)',
  },
  field: {
    style: 'showroom' as const,
    outside: '#E8E9EB',
    turf: '#33363C',
    border: '#D0D1D2',
    gridFaint: 'rgba(255, 255, 255, 0.07)',
    gridMajor: 'rgba(255, 255, 255, 0.18)',
    gridAccent: 'rgba(110, 149, 247, 0.35)',
    label: '#5C5E62',
    autoPath: '#6E95F7', // the brand blue, lifted so it reads on dark concrete
    pillBg: 'rgba(23, 26, 32, 0.92)',
    pillBorder: 'rgba(110, 149, 247, 0.9)',
    pillText: '#FFFFFF',
    sceneBg: '#D9DCE0',
    ground: '#3A3D43',
    under: '#2A2C31',
    grid3d: '#565A61',
    hemiSky: '#F4F5F7',
    hemiGround: '#5C5E62',
    fence: '#D0D1D2',
  },
  scene: {
    fog: '#D3D6DB',
    skyTop: '#B9C1CC',
    skyHorizon: '#E7E5E1',
    city: '#A9AFB8',
    concrete: '#B6B9BE',
  },
} as const;
