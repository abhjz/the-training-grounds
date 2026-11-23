export type EquipmentVisualType =
  | 'single_gate_blue'
  | 'single_gate_lightblue'
  | 'vertical_double'
  | 'vertical_triple'
  | 'vertical_quad'
  | 'flag_pole'
  | 'cube_gate'
  | 'double_cube'
  | 'round_gate'
  | 'container'
  | 'launch_pad'
  | 'pilot_pit'
  // Site pieces (src/constants/siteEquipment.ts)
  | 'turf_pitch'
  | 'sand_pit'
  | 'asphalt'
  | 'gravel_road'
  | 'dirt_lane'
  | 'dirt_curve'
  | 'dirt_area'
  | 'scrub_patch'
  | 'berm'
  | 'tree_big'
  | 'tree_small'
  | 'palm'
  | 'building'
  | 'cabin'
  | 'shade_shed'
  | 'open_shelter'
  | 'gazebo'
  | 'floodlight'
  | 'light_pole'
  | 'mast'
  | 'wreck'
  | 'double_arch'
  | 'tyre'
  | 'cable_drum'
  | 'jeep'
  | 'flagpole'
  | 'grass';

export interface EquipmentDef {
  id: string;
  name: string;
  shortName: string;
  width: number; // width in meters (top-down footprint)
  depth: number; // depth/thickness in meters
  heightDesc: string;
  totalStock: number;
  visualType: EquipmentVisualType;
  color: string;
  glowColor: string;
  borderColor: string;
  description: string;
  isGate: boolean;
  /** Made in the app by the user (stored in this browser) */
  isCustom?: boolean;
  /** Height of one frame/tier, or total height for a flag (metres). Defaults per shape when missing. */
  tierHeight?: number;
  /** 'site' = ground surfaces, terrain, trees, buildings (listed under "Site & scenery") */
  category?: 'site';
  /** Each placed copy can have its own width and length (pitches, roads, buildings...) */
  resizable?: boolean;
}

export interface TrackPoint {
  x: number; // in meters (0 to 57)
  y: number; // in meters (0 to 43)
  z?: number; // altitude in meters (0 to 5m)
  color?: string; // custom line color for this stroke segment
  /** Race line editor: 1 = a control point you placed, 0 = a point on the curve between them.
   *  Lets the editor rebuild exactly the points you set after a reload, undo or view switch. */
  k?: 0 | 1;
}

export interface PlacedItem {
  id: string;
  equipId: string;
  x: number; // in meters (0 to 57)
  y: number; // in meters (0 to 43)
  rotation: number; // in degrees (0, 15, 30, ..., 345) - Yaw / Heading
  pitch?: number; // pitch angle in degrees (-85 to +85) - tilt forward / backward
  roll?: number; // roll angle in degrees (-180 to +180) - bank / lean left / right
  sequenceOrder: number | null; // 1-based index or null
  isMirrored?: boolean; // horizontal flip
  maneuver?: string; // entry/exit maneuver
  targetTier?: number | string; // target tier: 1 (bottom), 2 (mid), 3 (top)
  maneuverOffsetX?: number; // custom horizontal offset from gate center (meters)
  maneuverOffsetY?: number; // custom vertical offset from gate center (meters)
  maneuverRotation?: number; // custom rotation angle of maneuver badge in degrees (0 - 360)
  locked?: boolean; // locked pieces can't be moved, rotated or deleted until unlocked
  elevation?: number; // height of the item's base above the ground in metres (0 to MAX_ITEM_ELEVATION)
  /** Logos as small image data URLs: 'flag' for a flag's banner; 'left', 'right', 'roof' for a container. */
  logos?: Partial<Record<'flag' | 'left' | 'right' | 'roof' | 'leftIn' | 'rightIn' | 'ceiling', string>>;
  /** LED neon lights on the item's frame: the light colour (hex), or missing when off */
  led?: string;
  /** Resizable pieces only: this copy's own width and length in metres */
  sizeW?: number;
  sizeD?: number;
  /** Resizable pieces only: this copy's own height in metres */
  sizeH?: number;
}

export interface ManeuverOption {
  id: string;
  label: string;
  shortLabel: string;
  iconSymbol: string;
}

export const MANEUVER_OPTIONS: ManeuverOption[] = [
  { id: 'straight', label: 'Default / Straight Pass', shortLabel: 'Straight', iconSymbol: '➜' },
  { id: 'enter_corkscrew_right', label: 'Enter gate Corkscrew right', shortLabel: 'Corkscrew R', iconSymbol: '↻' },
  { id: 'corkscrew_left', label: 'Corkscrew left', shortLabel: 'Corkscrew L', iconSymbol: '↺' },
  { id: 'slalom_left', label: 'Slalom left', shortLabel: 'Slalom L', iconSymbol: '⤹' },
  { id: 'slalom_right', label: 'Slalom right', shortLabel: 'Slalom R', iconSymbol: '⤸' },
  { id: 'dive_in', label: 'Dive in', shortLabel: 'Dive In', iconSymbol: '⬇' },
  { id: 'dive_out', label: 'Dive out', shortLabel: 'Dive Out', iconSymbol: '⬆' },
  { id: 'orbit_pole_left_exit', label: 'Orbit pole left and exit gate', shortLabel: 'Orbit L Exit', iconSymbol: '⤿' },
  { id: 'orbit_pole_right_exit', label: 'Orbit pole right and exit gate', shortLabel: 'Orbit R Exit', iconSymbol: '⤾' },
  { id: 'split_s', label: 'Split S', shortLabel: 'Split-S', iconSymbol: '↷' },
  { id: 'reverse_split_s', label: 'Reverse split S', shortLabel: 'Rev Split-S', iconSymbol: '↶' },
  { id: 'ladder_down_left', label: 'Ladder down left', shortLabel: 'Ladder Down L', iconSymbol: '⇃' },
  { id: 'ladder_down_right', label: 'Ladder down right', shortLabel: 'Ladder Down R', iconSymbol: '⇂' },
  { id: 'ladder_up_left', label: 'Ladder up left', shortLabel: 'Ladder Up L', iconSymbol: '↿' },
  { id: 'ladder_up_right', label: 'Ladder up right', shortLabel: 'Ladder Up R', iconSymbol: '↾' },
];

export interface PathSegment {
  fromId: string;
  toId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  distance: number; // straight-line in meters
  order: number;
}

export interface TrackMetrics {
  totalDistance: number;
  gateCount: number;
  longestStraight: number;
  shortestSegment: number;
  averageSegment: number;
  estimatedLapTime: number; // seconds at current selected speed
  isCustomDrawn?: boolean;
}

export interface SavedTrack {
  id: string;
  name: string;
  date: string;
  items: PlacedItem[];
  closeLoop: boolean;
  droneSpeedKmH: number;
  drawnPath?: TrackPoint[];
  /** Field the track was designed on (older saves don't have it) */
  ground?: TrackGround;
  /** What's painted across the ground (older saves don't have it: the ground name) */
  groundMark?: GroundMark;
}

/** What's painted across the middle of the ground. */
export interface GroundMark {
  mode: 'name' | 'text' | 'logo' | 'none';
  /** Your own text, e.g. the track name (mode 'text') */
  text?: string;
  /** Logo image as a data URL (mode 'logo') */
  logo?: string;
  /** 0.05 to 1. Missing = the look's normal faint watermark for text, 0.6 for a logo. */
  opacity?: number;
  /** Centre of the mark as a share of the field (0..1 across, 0..1 down). Missing = the middle. */
  x?: number;
  y?: number;
  /** Size relative to the normal (1 = spans most of the field). 0.1 to 2. */
  scale?: number;
  /** Turn in degrees, clockwise on the map. */
  rotation?: number;
}

export const DEFAULT_GROUND_MARK: GroundMark = { mode: 'name' };

/** Reads a ground mark from a file or storage; anything unusable falls back to the ground name. */
export function parseGroundMark(v: any): GroundMark {
  if (!v || typeof v !== 'object' || !['name', 'text', 'logo', 'none'].includes(v.mode)) return DEFAULT_GROUND_MARK;
  const m: GroundMark = { mode: v.mode };
  if (typeof v.text === 'string') m.text = v.text.slice(0, 60);
  if (typeof v.logo === 'string' && v.logo.startsWith('data:image/')) m.logo = v.logo;
  if (typeof v.opacity === 'number' && Number.isFinite(v.opacity)) m.opacity = Math.min(1, Math.max(0.05, v.opacity));
  const num = (n: any, lo: number, hi: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined);
  m.x = num(v.x, 0, 1);
  m.y = num(v.y, 0, 1);
  m.scale = num(v.scale, 0.1, 2);
  m.rotation = num(v.rotation, -360, 360);
  for (const k of ['x', 'y', 'scale', 'rotation'] as const) if (m[k] === undefined) delete m[k];
  return m;
}

export interface TrackGround {
  name: string;
  width: number; // metres
  height: number; // metres
}
