import { EquipmentDef } from '../types';

// Size and name of the active ground. These are live bindings: every module reads the current
// values at call time, and the app updates them with setActiveGround() when you switch grounds.
export let FIELD_WIDTH_M = 57;
export let FIELD_HEIGHT_M = 43;
export let ACTIVE_GROUND_NAME = 'The Training Grounds';
export const PERIMETER_FENCE_M = 3;

export function setActiveGround(g: { name: string; width: number; height: number }) {
  FIELD_WIDTH_M = g.width;
  FIELD_HEIGHT_M = g.height;
  ACTIVE_GROUND_NAME = g.name;
}

export const EQUIPMENT_INVENTORY: EquipmentDef[] = [
  {
    id: 'single-1.5',
    name: '1.5m × 1.5m Single Gate',
    shortName: '1.5m Gate',
    width: 1.5,
    depth: 0.4,
    heightDesc: '1.5m H',
    totalStock: 9999,
    visualType: 'single_gate_blue',
    color: '#2563eb', // Blue
    glowColor: 'rgba(37, 99, 235, 0.4)',
    borderColor: '#60a5fa',
    description: 'Standard racing arch gate. Agile drone entry.',
    isGate: true,
  },
  {
    id: 'single-2.5',
    name: '1.5m × 2.5m Single Gate (1.5m Arch + 1m Pole on Side)',
    shortName: '1.5m Gate (2.5m Side)',
    width: 1.5,
    depth: 0.4,
    heightDesc: '1.5m Arch / 2.5m Side',
    totalStock: 9999,
    visualType: 'single_gate_lightblue',
    color: '#0284c7', // Light Blue
    glowColor: 'rgba(56, 189, 248, 0.45)',
    borderColor: '#38bdf8',
    description: '1.5m × 1.5m arch gate with a 1m pole mounted on top of one side, reaching 2.5m total height.',
    isGate: true,
  },
  {
    id: 'triple-6x2',
    name: '6m × 2m Vertical Triple Gate (3× 2m Stacked)',
    shortName: '6m Triple Gate',
    width: 2.0,
    depth: 0.5,
    heightDesc: '6m Total H (3× 2m Stacked)',
    totalStock: 9999,
    visualType: 'vertical_triple',
    color: '#9333ea', // Purple
    glowColor: 'rgba(168, 85, 247, 0.45)',
    borderColor: '#c084fc',
    description: '3 single 2m × 2m gates stacked vertically on top of each other (6m total height).',
    isGate: true,
  },
  {
    id: 'quad-8x2',
    name: '8m × 2m Vertical Quad Gate (4× 2m Stacked)',
    shortName: '8m Quad Gate',
    width: 2.0,
    depth: 0.5,
    heightDesc: '8m Total H (4× 2m Stacked)',
    totalStock: 9999,
    visualType: 'vertical_quad',
    color: '#581c87', // Dark Purple
    glowColor: 'rgba(126, 34, 206, 0.5)',
    borderColor: '#a855f7',
    description: '4 single 2m × 2m gates stacked vertically on top of each other (8m total height).',
    isGate: true,
  },
  {
    id: 'flag-3m',
    name: '3m Flag Pole',
    shortName: '3m Flag',
    width: 0.9,
    depth: 0.9,
    heightDesc: '3m H',
    totalStock: 9999,
    visualType: 'flag_pole',
    color: '#ea580c', // Orange
    glowColor: 'rgba(251, 146, 60, 0.45)',
    borderColor: '#fb923c',
    description: 'High-visibility slalom turning pylon with orientation dot.',
    isGate: true,
  },
  {
    id: 'cube-2x2',
    name: '2m × 2m Cube Gate',
    shortName: '2m Cube',
    width: 2.0,
    depth: 2.0,
    heightDesc: '2m H',
    totalStock: 9999,
    visualType: 'cube_gate',
    color: '#059669', // Green
    glowColor: 'rgba(52, 211, 153, 0.45)',
    borderColor: '#34d399',
    description: '3D square tunnel gate testing precision 3D tunnel flight.',
    isGate: true,
  },
  {
    id: 'double-cube-4x2',
    name: '4m × 2m Vertical Double Cube Gate (2× 2m Cubes Stacked)',
    shortName: '4m Double Cube',
    width: 2.0,
    depth: 2.0,
    heightDesc: '4m H (2× 2m Cubes Stacked)',
    totalStock: 9999,
    visualType: 'double_cube',
    color: '#065f46', // Dark Emerald
    glowColor: 'rgba(16, 185, 129, 0.45)',
    borderColor: '#10b981',
    description: 'Two 2m × 2m cubes stacked vertically on top of each other (4m total height), with top dive & ground exit.',
    isGate: true,
  },
];

export const EQUIPMENT_MAP = new Map<string, EquipmentDef>(
  EQUIPMENT_INVENTORY.map((eq) => [eq.id, eq])
);
// Backward compatibility alias for double-2x2 -> triple-6x2
const tripleRef = EQUIPMENT_MAP.get('triple-6x2');
if (tripleRef) {
  EQUIPMENT_MAP.set('double-2x2', tripleRef);
}
