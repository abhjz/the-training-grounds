export type EquipmentVisualType =
  | 'single_gate_blue'
  | 'single_gate_lightblue'
  | 'vertical_double'
  | 'vertical_triple'
  | 'vertical_quad'
  | 'flag_pole'
  | 'cube_gate'
  | 'double_cube';

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
}

export interface TrackPoint {
  x: number; // in meters (0 to 57)
  y: number; // in meters (0 to 43)
  z?: number; // altitude in meters (0 to 5m)
  color?: string; // custom line color for this stroke segment
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
}

export interface TrackGround {
  name: string;
  width: number; // metres
  height: number; // metres
}
