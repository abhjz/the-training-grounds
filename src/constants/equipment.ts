import { EquipmentDef, PlacedItem } from '../types';
import { layerOfType, SITE_EQUIPMENT } from './siteEquipment';

// Size and name of the active ground. These are live bindings: every module reads the current
// values at call time, and the app updates them with setActiveGround() when you switch grounds.
export let FIELD_WIDTH_M = 57;
export let FIELD_HEIGHT_M = 43;
export let ACTIVE_GROUND_NAME = 'The Training Grounds';
export const PERIMETER_FENCE_M = 3;
/** LED neon colours to choose from (first is the default). */
export const LED_COLORS = ['#22d3ee', '#f472b6', '#a3e635', '#facc15', '#a78bfa', '#fb923c', '#ef4444', '#f8fafc'];

/** Highest an item's base can be raised above the ground (metres). */
export const MAX_ITEM_ELEVATION = 12;

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

// New pieces go after the originals so saved tracks and the inventory order stay the same
EQUIPMENT_INVENTORY.push(
  {
    id: 'round-1.6',
    name: '1.6m Round Gate (Hoop)',
    shortName: 'Round Gate',
    width: 1.6,
    depth: 0.3,
    heightDesc: '1.6m Ø',
    totalStock: 9999,
    visualType: 'round_gate',
    color: '#db2777', // Pink
    glowColor: 'rgba(244, 114, 182, 0.45)',
    borderColor: '#f472b6',
    description: 'Circular hoop gate, 1.6m across, standing on a foot. Fly through the middle.',
    isGate: true,
    tierHeight: 1.6,
  },
  {
    id: 'container-20ft',
    name: "20ft Shipping Container (Open Both Ends)",
    shortName: '20ft Container',
    width: 2.44,
    depth: 6.06,
    heightDesc: '2.59m H · 6.06m long',
    totalStock: 9999,
    visualType: 'container',
    color: '#b45309', // Rust
    glowColor: 'rgba(245, 158, 11, 0.4)',
    borderColor: '#f59e0b',
    description: 'Standard 20ft steel container with solid walls and roof, open at both ends. Fly through its length.',
    isGate: true,
    tierHeight: 2.59,
  },
  {
    id: 'launch-pad',
    name: 'Launch Pad (Take-off)',
    shortName: 'Launch Pad',
    width: 1.2,
    depth: 1.2,
    heightDesc: 'Flat · 1.2m × 1.2m',
    totalStock: 9999,
    visualType: 'launch_pad',
    color: '#ca8a04', // Yellow
    glowColor: 'rgba(250, 204, 21, 0.45)',
    borderColor: '#facc15',
    description: 'Where the drone takes off. Number it 1 to start the race line from the pad.',
    isGate: false,
    tierHeight: 0.05,
  },
  {
    id: 'pilot-pit',
    name: 'Pilot Pit Area (2 Canopies, Table, Chairs)',
    shortName: 'Pilot Pit',
    width: 6,
    depth: 3,
    heightDesc: '6m × 3m · 2.6m canopy',
    totalStock: 9999,
    visualType: 'pilot_pit',
    color: '#475569', // Slate
    glowColor: 'rgba(148, 163, 184, 0.4)',
    borderColor: '#94a3b8',
    description: 'Where the pilots sit: two 3m canopies, a table and chairs facing the field (arrow side).',
    isGate: false,
    tierHeight: 2.6,
  }
);

EQUIPMENT_INVENTORY.push(...SITE_EQUIPMENT);
// Every piece can be sized per copy (a bigger gate, a taller flag, a longer container...)
for (const e of EQUIPMENT_INVENTORY) e.resizable = true;

export const EQUIPMENT_MAP = new Map<string, EquipmentDef>(
  EQUIPMENT_INVENTORY.map((eq) => [eq.id, eq])
);
// Backward compatibility alias for double-2x2 -> triple-6x2
const tripleRef = EQUIPMENT_MAP.get('triple-6x2');
if (tripleRef) {
  EQUIPMENT_MAP.set('double-2x2', tripleRef);
}

/** Items in drawing order: ground surfaces first, then terrain, then everything else (stable). */
export function byLayer(items: PlacedItem[]): PlacedItem[] {
  return items
    .map((item, i) => ({ item, i, l: layerOfType(EQUIPMENT_MAP.get(item.equipId)?.visualType) }))
    .sort((a, b) => a.l - b.l || a.i - b.i)
    .map((x) => x.item);
}
