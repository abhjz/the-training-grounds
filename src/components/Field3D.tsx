import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowRight, Eye, Loader2, Minus, Wind, Orbit, Pause, Play, Plus, RotateCcw, RotateCw, Spline, Square, Trash2, Video } from 'lucide-react';
import { EquipmentDef, PlacedItem, TrackPoint } from '../types';
import { EQUIPMENT_MAP, FIELD_HEIGHT_M, FIELD_WIDTH_M, PERIMETER_FENCE_M } from '../constants/equipment';
import { generateCurvedPathFromGates, snapCoord } from '../utils/trackMath';
import { SceneExporter, Export3DRequest } from './SceneExporter';
import { drawWatermarkText, GroundMarkSource, GroundPaint, hasGroundMark } from '../utils/watermark';
import {
  RaceLineControls,
  pathToControls,
  controlsToPath,
  insertIndexFor,
  shapeAround,
  AroundMode,
  AroundTarget,
  clampAlt,
  DEFAULT_LINE_ALT,
  MIN_LINE_ALT,
  MAX_LINE_ALT,
} from '../utils/raceLine';
import { RaceLineHandles, PointDragManager, PointDragState, makePointDrag } from './RaceLineEditor';
import { FieldColors, fieldColors } from '../theme/engine';
import { SunkenCity, SunkenDeck, SUNKEN_FOG } from './SunkenScene';
import { CoastalField, CoastalSunsetWorld, SUN_DIR } from './CoastalSunsetScene';
import { ShowroomField, ShowroomWorld } from './ShowroomScene';
import { TradingField, TradingFloorWorld } from './TradingFloorScene';
import { SHOWROOM } from '../theme/showroom';
import { COASTAL_SUNSET } from '../theme/coastalSunset';
import { useMediaMatch } from '../hooks/useMediaMatch';
import { setSceneryMotion, useSceneryMotionSetting } from '../hooks/useSceneryMotion';
import { canExportVideo, createFrameEncoder } from '../utils/flightVideo';
import { cachedLogoImage } from '../utils/logos';
import { DesertField, DesertWorld, LedOverlay, SiteModel } from './SiteScenery';
import { GROUND_COVER_TYPES, itemDims } from '../constants/siteEquipment';
import { DESERT } from '../theme/desert';
import { glowBoost, graphicsQuality, PostFX, SkyDome, SunShadows, useGraphicsQuality } from './Graphics';
import { isNativeApp, saveFile } from '../utils/fileSaver';

// ---------------------------------------------------------------------------
// Coordinate mapping
// Field coords: x 0..57 (right), y 0..43 (down on the 2D map), z = altitude.
// Three.js: X = field x, Y = up (altitude), Z = field y. Field is centred on the origin.
// ---------------------------------------------------------------------------
const DEFAULT_FLIGHT_ALT = 1.2;

const toV3 = (x: number, y: number, z = 0) => new THREE.Vector3(x - (FIELD_WIDTH_M / 2), z, y - (FIELD_HEIGHT_M / 2));

const TUBE = 0.09; // gate frame tube thickness (m)

interface Field3DProps {
  groundName: string;
  /** What's painted across the ground (name, your text, or a logo); defaults to the ground name */
  groundPaint?: GroundPaint;
  /** Active colour theme id; changing it re-renders the scene in the new colours */
  themeId?: string;
  items: PlacedItem[];
  drawnPath: TrackPoint[];
  closeLoop: boolean;
  closeDrawnLoop: boolean;
  droneSpeedKmH: number;
  drawnPathColor: string;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  /** Drag-to-move in 3D: start (snapshot for undo), move to field metres, end (commit undo) */
  onMoveItemStart: (id: string) => void;
  onMoveItem: (id: string, x: number, y: number) => void;
  onMoveItemEnd: () => void;
  /** Race line editing: start (snapshot for undo), replace the line, end (commit undo) */
  onPathEditStart: () => void;
  onPathChange: (path: TrackPoint[]) => void;
  onPathEditEnd: () => void;
  /** Placing equipment from the inventory */
  placingEquipId: string | null;
  placementYaw: number;
  snapGrid: number;
  onPlaceAt: (equipId: string, x: number, y: number) => void;
  /** 3D export (model / image) */
  exportRequest: Export3DRequest | null;
  onExportDone: (ok: boolean, message: string) => void;
}

interface DragState {
  id: string;
  offX: number; // gate position minus grab point, field metres
  offY: number;
  startClientX: number;
  startClientY: number;
  started: boolean; // becomes true once the pointer moves past a small threshold
}

const DRAG_THRESHOLD_PX = 4;

type CameraMode = 'orbit' | 'fpv';

// ---------------------------------------------------------------------------
// Field: ground, 5 m grid, perimeter safety fence
// ---------------------------------------------------------------------------
/** How much bigger than the original 57 × 43 m field this ground is (camera distances scale with it). */
const fieldScale = () => Math.max(FIELD_WIDTH_M / 57, FIELD_HEIGHT_M / 43);
/** Default orbit camera. On tall/narrow viewports (phones in portrait) pull back so the whole field fits across. */
const defaultCameraPos = (aspect = 1.6): [number, number, number] => {
  const pullBack = aspect < 1.35 ? Math.min(2.4, 1.35 / aspect) : 1;
  const k = fieldScale() * pullBack;
  return [0, 44 * k, 52 * k];
};

/** Desert Site sky: clear morning, sun in the south-east (field +X), about 35° up, haze on the horizon. */
const DESERT_SKY = {
  zenith: '#5E8FC4',
  horizon: '#D9DEDD',
  ground: '#B5A790',
  sunDir: [78, 58, 22] as [number, number, number],
  sunColor: '#FFE9C4',
};

/** Writing colour per look (the same faint tones each look used on its own ground). */
const MARK_FILL: Record<string, string> = {
  flat: 'rgba(203, 213, 225, 0.10)',
  desert: 'rgba(255, 250, 238, 0.16)', // light paint with a dark edge reads on sand and turf
  coast: 'rgba(255, 225, 218, 0.12)',
  showroom: 'rgba(255, 255, 255, 0.07)',
  dock: 'rgba(220, 255, 245, 0.12)',
  trading: 'rgba(234, 236, 239, 0.06)',
};

/**
 * The ground marking (name, your text or a logo) as a see-through sheet lying just above the highest
 * ground piece (turf at 18 cm), so a pitch, road or grass patch can't cover it. Gates, trees and buildings
 * still stand in front of it, and it never catches clicks.
 */
function GroundMarkOverlay({ mark, fill }: { mark: GroundMarkSource; fill: string }) {
  const W = FIELD_WIDTH_M;
  const H = FIELD_HEIGHT_M;
  const tex = useMemo(() => {
    if (!hasGroundMark(mark)) return null;
    const pxPerM = Math.min(24, 4096 / Math.max(W, H));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * pxPerM);
    canvas.height = Math.round(H * pxPerM);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawWatermarkText(ctx, mark, canvas.width, canvas.height, fill);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [mark, fill, W, H]);
  useEffect(() => () => tex?.dispose(), [tex]);
  if (!tex) return null;
  // 14 cm above the turf (18 cm): enough for the depth test on a big field seen from far away
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.32} raycast={() => {}} renderOrder={1}>
      <planeGeometry args={[W, H]} />
      {/* Ground pieces nudge themselves forward by up to 5 depth steps to beat the sand; this beats them */}
      <meshStandardMaterial map={tex} transparent depthWrite={false} roughness={1} polygonOffset polygonOffsetFactor={0} polygonOffsetUnits={-12} />
    </mesh>
  );
}

/** Ground name painted faintly across the turf, like a watermark on a blueprint. */
function useWatermarkTexture(name: GroundMarkSource) {
  return useMemo(() => {
    const pxPerM = 24;
    const w = Math.round(FIELD_WIDTH_M * pxPerM);
    const h = Math.round(FIELD_HEIGHT_M * pxPerM);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx && hasGroundMark(name)) {
      drawWatermarkText(ctx, name, w, h, 'rgba(203, 213, 225, 0.10)');
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }, [name]);
}

function FieldGround({ groundName, fc }: { groundName: GroundMarkSource; fc: FieldColors }) {
  const watermark = useWatermarkTexture(groundName);
  const gridGeom = useMemo(() => {
    const pts: number[] = [];
    for (let x = 0; x <= FIELD_WIDTH_M; x += 5) pts.push(x - (FIELD_WIDTH_M / 2), 0.01, -(FIELD_HEIGHT_M / 2), x - (FIELD_WIDTH_M / 2), 0.01, (FIELD_HEIGHT_M / 2));
    for (let y = 0; y <= FIELD_HEIGHT_M; y += 5) pts.push(-(FIELD_WIDTH_M / 2), 0.01, y - (FIELD_HEIGHT_M / 2), (FIELD_WIDTH_M / 2), 0.01, y - (FIELD_HEIGHT_M / 2));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  const f = PERIMETER_FENCE_M;
  const fence = [
    toV3(f, f, 0.03),
    toV3(FIELD_WIDTH_M - f, f, 0.03),
    toV3(FIELD_WIDTH_M - f, FIELD_HEIGHT_M - f, 0.03),
    toV3(f, FIELD_HEIGHT_M - f, 0.03),
    toV3(f, f, 0.03),
  ];
  const border = [
    toV3(0, 0, 0.03),
    toV3(FIELD_WIDTH_M, 0, 0.03),
    toV3(FIELD_WIDTH_M, FIELD_HEIGHT_M, 0.03),
    toV3(0, FIELD_HEIGHT_M, 0.03),
    toV3(0, 0, 0.03),
  ];

  return (
    <group name="Field" userData={{ export: true }}>
      {/* Surrounding ground */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <planeGeometry args={[FIELD_WIDTH_M + 60, FIELD_HEIGHT_M + 60]} />
        <meshStandardMaterial color={fc.under} />
      </mesh>
      {/* Field turf */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[FIELD_WIDTH_M, FIELD_HEIGHT_M]} />
        <meshStandardMaterial color={fc.ground} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
        <planeGeometry args={[FIELD_WIDTH_M, FIELD_HEIGHT_M]} />
        <meshBasicMaterial map={watermark} transparent depthWrite={false} />
      </mesh>
      <lineSegments geometry={gridGeom}>
        <lineBasicMaterial color={fc.grid3d} transparent opacity={0.8} />
      </lineSegments>
      <Line points={border} color={fc.border} lineWidth={1.5} />
      <Line points={fence} color="#f59e0b" lineWidth={2} dashed dashSize={0.8} gapSize={0.5} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Gate building blocks (local frame: X = gate width, Y = up, Z = flight direction)
// ---------------------------------------------------------------------------
/** LED colour of the item being drawn, or null when its lights are off. */
const LedContext = React.createContext<string | null>(null);

/** Neon look: bright, untinted by the scene's tone mapping, with a soft see-through halo around it. */
function NeonMaterial({ color }: { color: string }) {
  // All of the light comes from the LED colour itself (black base), so it stays that colour instead of
  // washing out to white
  // With the effects on, the light is brighter than white and the bloom pass turns that into real glow
  return <meshStandardMaterial color="#000000" emissive={color} emissiveIntensity={1.15 * glowBoost()} toneMapped={false} roughness={0.4} />;
}
function HaloMaterial({ color }: { color: string }) {
  // The drawn halo stands in for glow on Low quality only; bloom does it properly otherwise
  return <meshBasicMaterial color={color} transparent opacity={graphicsQuality() === 'low' ? 0.3 : 0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />;
}

function Bar({
  pos,
  size,
  color,
  emissive,
}: {
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
  emissive: number;
}) {
  const led = React.useContext(LedContext);
  // Lit parts only: dark parts (floors, bases) are drawn with no glow and stay dark
  if (led && emissive > 0) {
    return (
      <group position={pos}>
        <mesh>
          <boxGeometry args={size} />
          <NeonMaterial color={led} />
        </mesh>
        <mesh userData={{ noExport: true }}>
          <boxGeometry args={[size[0] + 0.12, size[1] + 0.12, size[2] + 0.12]} />
          <HaloMaterial color={led} />
        </mesh>
      </group>
    );
  }
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} roughness={0.5} />
    </mesh>
  );
}

/** Square/rect frame: two posts + top bar (+ bottom bar when stacked). */
function Frame({
  w,
  h,
  y0,
  color,
  emissive,
  bottomBar,
}: {
  w: number;
  h: number;
  y0: number;
  color: string;
  emissive: number;
  bottomBar?: boolean;
}) {
  return (
    <group>
      <Bar pos={[-w / 2, y0 + h / 2, 0]} size={[TUBE, h, TUBE]} color={color} emissive={emissive} />
      <Bar pos={[w / 2, y0 + h / 2, 0]} size={[TUBE, h, TUBE]} color={color} emissive={emissive} />
      <Bar pos={[0, y0 + h, 0]} size={[w + TUBE, TUBE, TUBE]} color={color} emissive={emissive} />
      {bottomBar && <Bar pos={[0, y0, 0]} size={[w + TUBE, TUBE, TUBE]} color={color} emissive={emissive} />}
    </group>
  );
}

/** Wireframe cube made of 12 tube edges. */
function Cube({ s, h: height, y0, color, emissive }: { s: number; h?: number; y0: number; color: string; emissive: number }) {
  const ht = height ?? s; // frame height (defaults to a true cube)
  const half = s / 2;
  const bars: { pos: [number, number, number]; size: [number, number, number] }[] = [];
  for (const sx of [-half, half]) for (const sz of [-half, half]) bars.push({ pos: [sx, y0 + ht / 2, sz], size: [TUBE, ht, TUBE] });
  for (const sy of [y0, y0 + ht]) {
    for (const sz of [-half, half]) bars.push({ pos: [0, sy, sz], size: [s + TUBE, TUBE, TUBE] });
    for (const sx of [-half, half]) bars.push({ pos: [sx, sy, 0], size: [TUBE, TUBE, s + TUBE] });
  }
  return (
    <group>
      {bars.map((b, i) => (
        <Bar key={i} pos={b.pos} size={b.size} color={color} emissive={emissive} />
      ))}
    </group>
  );
}

/** Which stacked tier (0-based) the pilot is meant to fly through, if any. */
function targetTierIndex(item: PlacedItem): number | null {
  const t = item.targetTier;
  if (t === 'tier1' || t === 1 || t === 'ladder_up' || t === 'cube1_exit') return 0;
  if (t === 'tier2' || t === 2 || t === 'cube2_dive') return 1;
  if (t === 'tier3' || t === 3) return 2;
  if (t === 'tier4' || t === 4) return 3;
  return null;
}

/** Tiers stacked in a piece (1 for single frames and flags). */
function tierCount(eq: EquipmentDef | undefined): number {
  switch (eq?.visualType) {
    case 'vertical_double':
    case 'double_cube':
      return 2;
    case 'vertical_triple':
      return 3;
    case 'vertical_quad':
      return 4;
    default:
      return 1;
  }
}
/** Height of one tier (or the whole flag) in metres, from the piece's own size when it has one. */
export function tierHeightOf(eq: EquipmentDef | undefined): number {
  if (eq?.tierHeight) return eq.tierHeight;
  switch (eq?.visualType) {
    case 'single_gate_blue':
    case 'single_gate_lightblue':
      return 1.5;
    case 'flag_pole':
      return 3;
    case 'cube_gate':
    case 'double_cube':
      return eq.width;
    default:
      return 2;
  }
}
/** Highest point of a piece, for labels and hit areas. */
function topOf(eq: EquipmentDef | undefined): number {
  if (!eq) return 2;
  const th = tierHeightOf(eq);
  if (eq.visualType === 'single_gate_lightblue') return th + 1;
  return th * tierCount(eq);
}

// ---------------------------------------------------------------------------
// Logos on items
// ---------------------------------------------------------------------------
const logoTextures = new Map<string, THREE.Texture>();
function useLogoTexture(src: string | undefined) {
  const [, setReady] = useState(0);
  if (!src) return null;
  let tex = logoTextures.get(src);
  if (!tex) {
    const img = cachedLogoImage(src, () => setReady((n) => n + 1));
    if (!img) return null;
    tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    logoTextures.set(src, tex);
  }
  return tex;
}

/** A logo on a flat surface, as large as fits in boxW × boxH without stretching. Faces local +Z. */
function LogoPlane({
  src,
  boxW,
  boxH,
  position,
  rotation,
}: {
  src: string | undefined;
  boxW: number;
  boxH: number;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  const tex = useLogoTexture(src);
  if (!tex) return null;
  const img = tex.image as HTMLImageElement;
  const aspect = (img.naturalWidth || img.width || 1) / (img.naturalHeight || img.height || 1);
  const w = Math.min(boxW, boxH * aspect);
  const h = w / aspect;
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} transparent alphaTest={0.02} roughness={0.7} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

/** 20ft container: floor, roof and two corrugated side walls; both ends open to fly through. */
function ContainerModel({
  w,
  d,
  h,
  color,
  wall,
  emissive,
  logos,
}: {
  w: number;
  d: number;
  h: number;
  color: string;
  wall: string;
  emissive: number;
  logos?: PlacedItem['logos'];
}) {
  const t = 0.06; // steel wall thickness
  const ribs = Math.round(d / 0.3);
  return (
    <group>
      <Bar pos={[0, 0.05, 0]} size={[w, 0.1, d]} color="#3f3f46" emissive={0} />
      <mesh position={[0, h - t / 2, 0]}>
        <boxGeometry args={[w, t, d]} />
        <meshStandardMaterial color={wall} metalness={0.3} roughness={0.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[(side * (w - t)) / 2, h / 2, 0]}>
            <boxGeometry args={[t, h, d]} />
            <meshStandardMaterial color={wall} metalness={0.3} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
          {/* Corrugation ribs on the outside */}
          {Array.from({ length: ribs }, (_, i) => (
            <mesh key={i} position={[side * (w / 2 + 0.015), h / 2, -d / 2 + ((i + 0.5) * d) / ribs]}>
              <boxGeometry args={[0.03, h - 0.15, 0.1]} />
              <meshStandardMaterial color={wall} metalness={0.3} roughness={0.5} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Logos: right wall is on the pilot's right when flying along the arrow (local -X), left on +X */}
      <LogoPlane src={logos?.left} boxW={d * 0.8} boxH={h * 0.72} position={[w / 2 + 0.045, h / 2, 0]} rotation={[0, Math.PI / 2, 0]} />
      <LogoPlane src={logos?.right} boxW={d * 0.8} boxH={h * 0.72} position={[-w / 2 - 0.045, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]} />
      <LogoPlane src={logos?.roof} boxW={d * 0.8} boxH={w * 0.85} position={[0, h + 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} />
      {/* Inside faces: what you see flying through */}
      <LogoPlane src={logos?.leftIn} boxW={d * 0.8} boxH={h * 0.72} position={[w / 2 - t - 0.01, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]} />
      <LogoPlane src={logos?.rightIn} boxW={d * 0.8} boxH={h * 0.72} position={[-w / 2 + t + 0.01, h / 2, 0]} rotation={[0, Math.PI / 2, 0]} />
      <LogoPlane src={logos?.ceiling} boxW={d * 0.8} boxH={w * 0.8} position={[0, h - t - 0.01, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]} />
      {/* Corner posts and the two open end frames, in the highlight colour so the openings read clearly */}
      {[-1, 1].map((end) => (
        <group key={end} position={[0, 0, (end * d) / 2]}>
          <Bar pos={[-w / 2, h / 2, 0]} size={[0.16, h, 0.16]} color={color} emissive={emissive} />
          <Bar pos={[w / 2, h / 2, 0]} size={[0.16, h, 0.16]} color={color} emissive={emissive} />
          <Bar pos={[0, h - 0.08, 0]} size={[w, 0.16, 0.16]} color={color} emissive={emissive} />
          <Bar pos={[0, 0.08, 0]} size={[w, 0.16, 0.16]} color={color} emissive={emissive} />
        </group>
      ))}
    </group>
  );
}

/** Pilots' area: two pop-up canopies, a table at the back and chairs facing the field (+Z). */
function PilotPitModel({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  const tents = Math.max(1, Math.round(w / 3));
  const tw = w / tents;
  const chairs = tents * 2;
  return (
    <group>
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#334155" transparent opacity={0.55} />
      </mesh>
      {Array.from({ length: tents }, (_, i) => {
        const cx = -w / 2 + tw * (i + 0.5);
        const legs: [number, number][] = [
          [-tw / 2 + 0.1, -d / 2 + 0.1],
          [tw / 2 - 0.1, -d / 2 + 0.1],
          [-tw / 2 + 0.1, d / 2 - 0.1],
          [tw / 2 - 0.1, d / 2 - 0.1],
        ];
        return (
          <group key={i} position={[cx, 0, 0]}>
            {legs.map(([x, z], j) => (
              <mesh key={j} position={[x, (h - 0.5) / 2, z]}>
                <cylinderGeometry args={[0.03, 0.03, h - 0.5, 8]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.5} />
              </mesh>
            ))}
            {/* Pyramid roof */}
            <mesh position={[0, h - 0.25, 0]} rotation-y={Math.PI / 4} scale={[tw / 3, 1, d / 3]}>
              <coneGeometry args={[3 / Math.SQRT2, 0.5, 4, 1, true]} />
              <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.8} />
            </mesh>
          </group>
        );
      })}
      {/* Table along the back */}
      <mesh position={[0, 0.74, -d / 2 + 0.55]}>
        <boxGeometry args={[Math.min(w - 1, 4), 0.05, 0.7]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      {/* Chairs facing the field */}
      {Array.from({ length: chairs }, (_, i) => {
        const x = -w / 2 + (w / chairs) * (i + 0.5);
        return (
          <group key={i} position={[x, 0, d / 2 - 0.9]}>
            <mesh position={[0, 0.45, 0]}>
              <boxGeometry args={[0.48, 0.06, 0.45]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
            <mesh position={[0, 0.72, -0.21]}>
              <boxGeometry args={[0.48, 0.5, 0.05]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
            {[-0.2, 0.2].map((lx) =>
              [-0.18, 0.18].map((lz) => (
                <mesh key={`${lx}${lz}`} position={[lx, 0.22, lz]}>
                  <boxGeometry args={[0.03, 0.44, 0.03]} />
                  <meshStandardMaterial color="#94a3b8" />
                </mesh>
              ))
            )}
          </group>
        );
      })}
    </group>
  );
}

function GateModel({ item, selected }: { item: PlacedItem; selected: boolean }) {
  const equip = EQUIPMENT_MAP.get(item.equipId);
  if (!equip) return null;
  const c = selected ? '#fde047' : equip.isCustom ? equip.color : equip.borderColor;
  const base = selected ? 0.9 : 0.35;
  const target = targetTierIndex(item);
  const tierGlow = (i: number) => (target === i ? 1.2 : base);
  // This copy's size (resized in its settings), else the piece's own
  const dims = itemDims(item, equip);
  const w = dims.w;
  const th = equip.resizable && item.sizeH ? item.sizeH : equip.visualType === 'cube_gate' || equip.visualType === 'double_cube' ? (equip.tierHeight ?? w) : tierHeightOf(equip);

  switch (equip.visualType) {
    case 'single_gate_blue':
      return <Frame w={w} h={th} y0={0} color={c} emissive={base} />;
    case 'single_gate_lightblue':
      return (
        <group>
          <Frame w={w} h={th} y0={0} color={c} emissive={base} />
          {/* 1 m pole mounted on top of the left post */}
          <Bar pos={[-w / 2, th + 0.5, 0]} size={[TUBE, 1.0, TUBE]} color={c} emissive={base} />
        </group>
      );
    case 'vertical_double':
    case 'vertical_triple':
    case 'vertical_quad':
      return (
        <group>
          {Array.from({ length: tierCount(equip) }, (_, i) => (
            <Frame key={i} w={w} h={th} y0={i * th} color={c} emissive={tierGlow(i)} bottomBar={i > 0} />
          ))}
        </group>
      );
    case 'flag_pole': {
      const bannerH = Math.min(1.6, th * 0.55);
      return (
        <group>
          <mesh position={[0, th / 2, 0]}>
            <cylinderGeometry args={[0.04, 0.05, th, 12]} />
            {item.led ? <NeonMaterial color={item.led} /> : <meshStandardMaterial color="#e2e8f0" />}
          </mesh>
          {item.led && (
            <mesh position={[0, th / 2, 0]} userData={{ noExport: true }}>
              <cylinderGeometry args={[0.1, 0.11, th, 12]} />
              <HaloMaterial color={item.led} />
            </mesh>
          )}
          <mesh position={[0.35, th - bannerH / 2 - 0.05, 0]}>
            <boxGeometry args={[0.7, bannerH, 0.03]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={base} side={THREE.DoubleSide} />
          </mesh>
          {/* Same logo on both faces of the banner (the back one turned so it isn't mirrored) */}
          <LogoPlane src={item.logos?.flag} boxW={0.62} boxH={bannerH - 0.12} position={[0.35, th - bannerH / 2 - 0.05, 0.017]} />
          <LogoPlane src={item.logos?.flag} boxW={0.62} boxH={bannerH - 0.12} position={[0.35, th - bannerH / 2 - 0.05, -0.017]} rotation={[0, Math.PI, 0]} />
        </group>
      );
    }
    case 'cube_gate':
      return <Cube s={w} h={th} y0={0} color={c} emissive={base} />;
    case 'double_cube':
      return (
        <group>
          <Cube s={w} h={th} y0={0} color={c} emissive={tierGlow(0)} />
          <Cube s={w} h={th} y0={th} color={c} emissive={tierGlow(1)} />
        </group>
      );
    case 'round_gate': {
      const tube = TUBE * 1.2;
      const r = th / 2 - tube; // th is the outside diameter
      return (
        <group>
          {/* The hoop faces the flight direction (local Z), standing on a foot */}
          <mesh position={[0, th / 2 + 0.05, 0]}>
            <torusGeometry args={[r, tube, 16, 64]} />
            {item.led ? <NeonMaterial color={item.led} /> : <meshStandardMaterial color={c} emissive={c} emissiveIntensity={base} roughness={0.5} />}
          </mesh>
          {item.led && (
            <mesh position={[0, th / 2 + 0.05, 0]} userData={{ noExport: true }}>
              <torusGeometry args={[r, tube + 0.07, 12, 64]} />
              <HaloMaterial color={item.led} />
            </mesh>
          )}
          <Bar pos={[0, 0.025, 0]} size={[Math.max(0.6, w * 0.55), 0.05, 0.35]} color="#334155" emissive={0} />
          <Bar pos={[0, 0.06, 0]} size={[0.12, 0.08, 0.12]} color={c} emissive={base} />
        </group>
      );
    }
    case 'container': {
      const cd = itemDims(item, equip);
      return (
        <ContainerModel
          w={cd.w}
          d={cd.d}
          h={cd.h ?? th}
          color={c}
          wall={selected ? '#a16207' : equip.color}
          emissive={base}
          logos={item.logos}
        />
      );
    }
    case 'launch_pad':
      return (
        <group>
          <Bar pos={[0, 0.02, 0]} size={[w, 0.04, dims.d]} color="#111827" emissive={0} />
          {/* Yellow border and an H, like a helipad */}
          {[-1, 1].map((sgn) => (
            <group key={sgn}>
              <Bar pos={[(sgn * (w - 0.08)) / 2, 0.045, 0]} size={[0.08, 0.01, dims.d]} color={c} emissive={base} />
              <Bar pos={[0, 0.045, (sgn * (dims.d - 0.08)) / 2]} size={[w, 0.01, 0.08]} color={c} emissive={base} />
              <Bar pos={[sgn * 0.2, 0.045, 0]} size={[0.07, 0.01, 0.55]} color="#f8fafc" emissive={0.3} />
            </group>
          ))}
          <Bar pos={[0, 0.045, 0]} size={[0.4, 0.01, 0.07]} color="#f8fafc" emissive={0.3} />
          {/* Take-off direction */}
          <mesh position={[0, 0.05, dims.d / 2 - 0.2]} rotation-x={Math.PI / 2}>
            <coneGeometry args={[0.1, 0.18, 3]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={base} />
          </mesh>
        </group>
      );
    case 'pilot_pit':
      return (
        <group>
          <PilotPitModel w={w} d={dims.d} h={th} color={selected ? '#fde047' : equip.borderColor} />
          {item.led && <LedOverlay item={item} equip={equip} w={w} d={dims.d} h={th} color={item.led} />}
        </group>
      );
    default: {
      // Site pieces (ground, terrain, trees, buildings...), sized per item when resized
      return (
        <group>
          <SiteModel item={item} equip={equip} w={dims.w} d={dims.d} h={dims.h} selected={selected} color={c} emissive={base} />
          {item.led && <LedOverlay item={item} equip={equip} w={dims.w} d={dims.d} h={dims.h ?? equip.tierHeight ?? 2} color={item.led} />}
        </group>
      );
    }
  }
}

function PlacedGate({
  item,
  selected,
  onSelect,
  onGrab,
}: {
  item: PlacedItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onGrab: (item: PlacedItem, e: ThreeEvent<PointerEvent>) => void;
}) {
  const elev = item.elevation ?? 0;
  const pos = toV3(item.x, item.y, elev);
  const yaw = (item.rotation * Math.PI) / 180;
  const pitch = ((item.pitch ?? 0) * Math.PI) / 180;
  const roll = ((item.roll ?? 0) * Math.PI) / 180;
  const equip = EQUIPMENT_MAP.get(item.equipId);
  const dims = itemDims(item, equip);
  const topY = (() => {
    if (!equip?.resizable || !item.sizeH) return topOf(equip);
    if (equip.category === 'site') return item.sizeH;
    // Resized gate: its new tier height times its tiers (+1 m pole on the side-pole gate)
    return topOf({ ...equip, tierHeight: item.sizeH });
  })();
  // Ground surfaces (pitch, roads, dirt track...) never catch clicks in 3D: gates on them stay easy to grab
  const groundCover = !!equip && GROUND_COVER_TYPES.has(equip.visualType);

  return (
    <group
      position={pos}
      name={`${item.sequenceOrder ? `Gate ${item.sequenceOrder} - ` : ''}${equip?.shortName ?? item.equipId}`}
      userData={{ export: true }}
    >
      {/* The 2D map rotates clockwise (y points down), which is a negative turn about the 3D up axis */}
      <group
        rotation={new THREE.Euler(-pitch, -yaw, roll, 'YXZ')}
        scale={[item.isMirrored ? -1 : 1, 1, 1]}
        userData={{ gateId: item.id }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(item.id);
        }}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          onGrab(item, e);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <LedContext.Provider value={item.led ?? null}>
          <GateModel item={item} selected={selected} />
        </LedContext.Provider>
        {/* Invisible, generous hit box so thin frames are easy to click */}
        {!groundCover && (
          <mesh position={[0, Math.max(0.4, topY) / 2, 0]} visible={false}>
            <boxGeometry args={[Math.max(1, dims.w) + 0.4, Math.max(0.4, topY), Math.max(0.8, dims.d)]} />
          </mesh>
        )}
      </group>
      {/* Raised items float freely (no stand); the selection ring below stays on the ground */}
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02 - elev} userData={{ noExport: true }}>
          <ringGeometry args={[1.4, 1.6, 40]} />
          <meshBasicMaterial color="#fde047" transparent opacity={0.8} />
        </mesh>
      )}
      {((item.sequenceOrder !== null && item.sequenceOrder > 0) || (item.locked && equip?.category !== 'site')) && (
        <Html position={[0, topY + 0.6, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
              selected ? 'bg-yellow-300 text-slate-900 border-yellow-200' : 'bg-slate-900/90 text-sky-300 border-sky-500/60'
            }`}
          >
            {item.sequenceOrder}
            {item.locked && equip?.category !== 'site' && ' 🔒'}
          </div>
        </Html>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Flight line + animated drone
// ---------------------------------------------------------------------------
function buildCumulative(points: THREE.Vector3[]) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
  return cum;
}

function pointAt(points: THREE.Vector3[], cum: number[], d: number, out: THREE.Vector3) {
  const total = cum[cum.length - 1];
  const t = ((d % total) + total) % total;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= t) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  return out.copy(points[lo]).lerp(points[hi], (t - cum[lo]) / seg);
}

/** Where the camera sits while the drone flies the line. */
export type FlyPov = 'fpv' | 'chase' | 'above' | 'side' | 'spectator';
export const FLY_POVS: { id: FlyPov; label: string; title: string }[] = [
  { id: 'fpv', label: 'FPV', title: 'Pilot view from the drone camera, banking into turns' },
  { id: 'chase', label: 'Chase', title: 'Follow just behind and above the drone' },
  { id: 'above', label: 'Above', title: 'High follow camera looking down on the drone' },
  { id: 'side', label: 'Side', title: 'Fly alongside the drone' },
  { id: 'spectator', label: 'Spectator', title: 'Stand at the pilot area and watch the drone' },
];
const POV_FOV: Record<FlyPov, number> = { fpv: 88, chase: 62, above: 50, side: 55, spectator: 38 };
const ORBIT_FOV = 50;
/** FPV camera lens, as the horizontal field of view pilots quote for their cameras. */
export const FPV_LENS_MIN = 90;
export const FPV_LENS_MAX = 150;
export const FPV_LENS_DEFAULT = 120;
/** How far the third-person cameras sit from the drone, as a multiple of their normal distance. */
const POV_ZOOM_MIN = 0.4;
const POV_ZOOM_MAX = 3;
const clampZoom = (z: number) => THREE.MathUtils.clamp(z, POV_ZOOM_MIN, POV_ZOOM_MAX);
const clampLens = (deg: number) => Math.round(THREE.MathUtils.clamp(deg, FPV_LENS_MIN, FPV_LENS_MAX));
/** three.js wants the vertical angle; convert from the lens's horizontal angle for this screen shape. */
const lensToVerticalFov = (hDeg: number, aspect: number) =>
  Math.min(170, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hDeg) / 2) / Math.max(0.2, aspect))));

function Drone({
  points,
  speedMs,
  playing,
  cameraMode,
  pov,
  fpvLens,
  zoom,
  distRef,
  restartKey,
}: {
  points: THREE.Vector3[];
  speedMs: number;
  playing: boolean;
  cameraMode: CameraMode;
  pov: FlyPov;
  fpvLens: number;
  /** Camera distance multiplier for the third-person views (1 = normal). */
  zoom: number;
  /** Metres flown since the start line; shared so a video export can start the drone at the start line. */
  distRef: React.MutableRefObject<number>;
  /** Changes when a video export starts: snap the camera into place instead of gliding from where it was. */
  restartKey?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const rollRef = useRef(0);
  const camPosRef = useRef<THREE.Vector3 | null>(null);
  const cum = useMemo(() => buildCumulative(points), [points]);
  const v = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      far: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      next: new THREE.Vector3(),
      want: new THREE.Vector3(),
      side: new THREE.Vector3(),
    }),
    []
  );
  const { camera, size } = useThree();
  const flying = cameraMode === 'fpv';
  const aspect = size.width / Math.max(1, size.height);

  // Lens per point of view; back to the normal lens in orbit
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = !flying ? ORBIT_FOV : pov === 'fpv' ? lensToVerticalFov(fpvLens, aspect) : POV_FOV[pov];
    cam.updateProjectionMatrix();
  }, [camera, flying, pov, fpvLens, aspect]);
  useEffect(() => {
    camPosRef.current = null; // jump straight to the new view instead of gliding there
  }, [flying, pov]);
  useEffect(() => {
    camPosRef.current = null;
    rollRef.current = 0;
  }, [restartKey]);
  useEffect(
    () => () => {
      const cam = camera as THREE.PerspectiveCamera;
      cam.fov = ORBIT_FOV;
      cam.updateProjectionMatrix();
    },
    [camera]
  );

  useFrame((_, delta) => {
    if (!ref.current || points.length < 2 || cum[cum.length - 1] <= 0) return;
    const dt = Math.min(delta, 0.1);
    if (playing) distRef.current += speedMs * dt;
    const d = distRef.current;
    const { pos, ahead, far, fwd, next, want, side } = v;
    pointAt(points, cum, d, pos);
    pointAt(points, cum, d + 2.5, ahead);
    pointAt(points, cum, d + 6, far);

    // Bank into turns: how fast the heading swings left (+) or right (-)
    fwd.set(ahead.x - pos.x, 0, ahead.z - pos.z).normalize();
    next.set(far.x - ahead.x, 0, far.z - ahead.z).normalize();
    const turn = fwd.z * next.x - fwd.x * next.z;
    const rollTarget = THREE.MathUtils.clamp(turn * 1.4, -0.75, 0.75);
    rollRef.current = THREE.MathUtils.damp(rollRef.current, rollTarget, 5, dt);

    ref.current.position.copy(pos);
    ref.current.lookAt(ahead);
    ref.current.rotateZ(-rollRef.current);

    if (!flying) return;
    if (pov === 'fpv') {
      camera.position.copy(pos).add(new THREE.Vector3(0, 0.12, 0));
      camera.lookAt(ahead.x, ahead.y + 0.1, ahead.z);
      camera.rotateZ(rollRef.current);
      return;
    }

    // Third-person views glide after the drone so turns stay smooth
    side.set(-fwd.z, 0, fwd.x); // right-hand side of the heading
    const k = fieldScale();
    const z = zoom;
    if (pov === 'chase') want.copy(pos).addScaledVector(fwd, -2.4 * z).add(new THREE.Vector3(0, 0.9 * z, 0));
    else if (pov === 'above') want.copy(pos).addScaledVector(fwd, -9 * k * z).add(new THREE.Vector3(0, 14 * k * z, 0));
    else if (pov === 'side') want.copy(pos).addScaledVector(side, 5.5 * z).addScaledVector(fwd, 1).add(new THREE.Vector3(0, 0.8 * Math.sqrt(z), 0));
    else want.set(0, 1.7, FIELD_HEIGHT_M / 2 + PERIMETER_FENCE_M * 0.6); // pilot area at the near edge
    want.y = Math.max(want.y, 0.3);

    if (!camPosRef.current) camPosRef.current = want.clone();
    else if (pov !== 'spectator') {
      const stiff = pov === 'chase' ? 6 : 3;
      camPosRef.current.x = THREE.MathUtils.damp(camPosRef.current.x, want.x, stiff, dt);
      camPosRef.current.y = THREE.MathUtils.damp(camPosRef.current.y, want.y, stiff, dt);
      camPosRef.current.z = THREE.MathUtils.damp(camPosRef.current.z, want.z, stiff, dt);
    }
    camera.position.copy(camPosRef.current);
    if (pov === 'chase') camera.lookAt(next.copy(pos).lerp(ahead, 0.35)); // aim near the drone so it stays in frame on tall screens
    else camera.lookAt(pos);
    if (pov === 'spectator') {
      // Zoom like a broadcast camera so the drone stays a readable size across the field
      const cam = camera as THREE.PerspectiveCamera;
      const dist = camera.position.distanceTo(pos);
      cam.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan((2.5 * zoom) / dist)), 4, 75);
      cam.updateProjectionMatrix();
    }
  });

  const arm = 0.19;
  return (
    <group ref={ref} visible={!(flying && pov === 'fpv')} scale={1.5}>
      {/* Body */}
      <mesh>
        <boxGeometry args={[0.14, 0.05, 0.22]} />
        <meshStandardMaterial color="#e2e8f0" emissive="#38bdf8" emissiveIntensity={0.6} />
      </mesh>
      {/* Arms and props */}
      {[
        [arm, arm],
        [-arm, arm],
        [arm, -arm],
        [-arm, -arm],
      ].map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x / 2, 0, z / 2]} rotation={[0, Math.atan2(x, z), 0]}>
            <boxGeometry args={[0.025, 0.02, Math.hypot(x, z)]} />
            <meshStandardMaterial color="#cbd5e1" emissive="#94a3b8" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[x, 0.035, z]}>
            <cylinderGeometry args={[0.1, 0.1, 0.006, 20]} />
            <meshStandardMaterial
              color={i < 2 ? '#38bdf8' : '#f97316'}
              emissive={i < 2 ? '#38bdf8' : '#f97316'}
              emissiveIntensity={0.9}
              transparent
              opacity={0.75}
            />
          </mesh>
        </group>
      ))}
      <pointLight color="#38bdf8" intensity={4} distance={4} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Video export: steps the scene one exact frame at a time and encodes each frame
// ---------------------------------------------------------------------------
interface ExportJob {
  id: number;
  frames: number;
  fps: number;
}
type ExportResult = { blob?: Blob; error?: string; cancelled?: boolean };

function ExportDriver({
  job,
  cancelRef,
  onProgress,
  onFinish,
}: {
  job: ExportJob | null;
  cancelRef: React.MutableRefObject<boolean>;
  onProgress: (fraction: number) => void;
  onFinish: (result: ExportResult) => void;
}) {
  const get = useThree((s) => s.get);
  const cbRef = useRef({ onProgress, onFinish });
  cbRef.current = { onProgress, onFinish };

  useEffect(() => {
    if (!job) return;
    let encoder: Awaited<ReturnType<typeof createFrameEncoder>> | null = null;
    (async () => {
      try {
        const { gl, clock } = get();
        const canvas = gl.domElement;
        encoder = await createFrameEncoder(canvas.width, canvas.height, job.fps);
        // The Canvas is in 'never' mode now: nothing draws unless advance() is called
        let t = clock.elapsedTime;
        for (let i = 0; i < job.frames; i++) {
          if (cancelRef.current) {
            encoder.abort();
            cbRef.current.onFinish({ cancelled: true });
            return;
          }
          t += 1 / job.fps;
          get().advance(t); // runs every useFrame with an exact 1/fps step, then draws
          await encoder.addFrame(canvas);
          if (i % 3 === 0) {
            cbRef.current.onProgress((i + 1) / job.frames);
            await new Promise((r) => setTimeout(r, 0)); // let the progress label repaint
          }
        }
        const blob = await encoder.finish();
        cbRef.current.onFinish({ blob });
      } catch (err) {
        encoder?.abort();
        cbRef.current.onFinish({ error: String((err as Error)?.message ?? err) });
      }
    })();
    // The job id is the only trigger; cancelling goes through cancelRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);
  return null;
}

/** Safe file name from the ground name: "Al Qudra Field" -> "al-qudra-field". */
const fileSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'track';

function OrbitRig({
  active,
  enabled,
  controlsRef,
}: {
  active: boolean;
  enabled: boolean;
  controlsRef: React.MutableRefObject<any>;
}) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (active) {
      camera.position.set(...defaultCameraPos(size.width / Math.max(1, size.height)));
      camera.lookAt(0, 0, 0);
    }
  }, [active, camera]);
  if (!active) return null;
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={enabled}
      target={[0, 0, 0]}
      maxPolarAngle={Math.PI / 2 - 0.05}
      minDistance={3}
      maxDistance={200 * fieldScale()}
      enableDamping
    />
  );
}

// ---------------------------------------------------------------------------
// Drag-to-move: follows the pointer on the ground plane while a gate is grabbed
// ---------------------------------------------------------------------------
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function DragManager({
  dragRef,
  onMoveItemStart,
  onMoveItem,
  onEnd,
}: {
  dragRef: React.MutableRefObject<DragState | null>;
  onMoveItemStart: (id: string) => void;
  onMoveItem: (id: string, x: number, y: number) => void;
  onEnd: (didMove: boolean) => void;
}) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.started) {
        if (Math.hypot(ev.clientX - d.startClientX, ev.clientY - d.startClientY) < DRAG_THRESHOLD_PX) return;
        d.started = true;
        onMoveItemStart(d.id);
        document.body.style.cursor = 'grabbing';
      }
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(GROUND_PLANE, hit)) {
        onMoveItem(d.id, hit.x + (FIELD_WIDTH_M / 2) + d.offX, hit.z + (FIELD_HEIGHT_M / 2) + d.offY);
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      onEnd(d.started);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [camera, gl, dragRef, onMoveItemStart, onMoveItem, onEnd]);
  return null;
}

/** Shares the live camera and canvas element with code outside the 3D canvas (drag-and-drop). */
function CameraGrabber({ target }: { target: React.MutableRefObject<{ camera: THREE.Camera; dom: HTMLElement } | null> }) {
  const { camera, gl } = useThree();
  const controls = useThree((s) => s.controls);
  target.current = { camera, dom: gl.domElement };
  // Development only: lets test scripts put the camera at an exact spot
  if (import.meta.env.DEV) (window as any).__tg3d = { camera, controls, gl };
  return null;
}

// ---------------------------------------------------------------------------
// Main 3D view
// ---------------------------------------------------------------------------
export default function Field3D({
  groundName,
  groundPaint,
  themeId,
  items,
  drawnPath,
  closeLoop,
  closeDrawnLoop,
  droneSpeedKmH,
  drawnPathColor,
  selectedItemId,
  onSelectItem,
  onMoveItemStart,
  onMoveItem,
  onMoveItemEnd,
  onPathEditStart,
  onPathChange,
  onPathEditEnd,
  placingEquipId,
  placementYaw,
  snapGrid,
  onPlaceAt,
  exportRequest,
  onExportDone,
}: Field3DProps) {
  // ---------------- Placing equipment ----------------
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<{ camera: THREE.Camera; dom: HTMLElement } | null>(null);
  const placeDownRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!placingEquipId) setGhostPos(null);
  }, [placingEquipId]);
  const snapField = (x: number, y: number) => ({
    x: snapCoord(x, snapGrid, FIELD_WIDTH_M),
    y: snapCoord(y, snapGrid, FIELD_HEIGHT_M),
  });
  /** Field position under a screen point (for drag-and-drop from the inventory). */
  const groundAtClient = (clientX: number, clientY: number) => {
    const c = cameraRef.current;
    if (!c) return null;
    const rect = c.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, c.camera);
    const hit = new THREE.Vector3();
    if (!rc.ray.intersectPlane(GROUND_PLANE, hit)) return null;
    return { x: hit.x + FIELD_WIDTH_M / 2, y: hit.z + FIELD_HEIGHT_M / 2 };
  };

  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [flyPov, setFlyPov] = useState<FlyPov>(() => {
    try {
      const saved = localStorage.getItem('tg.flyPov') as FlyPov | null;
      return saved && FLY_POVS.some((p) => p.id === saved) ? saved : 'fpv';
    } catch {
      return 'fpv';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('tg.flyPov', flyPov);
    } catch {
      /* private mode: just don't remember it */
    }
  }, [flyPov]);
  const [fpvLens, setFpvLens] = useState<number>(() => {
    try {
      const n = Number(localStorage.getItem('tg.fpvLens'));
      return n >= FPV_LENS_MIN && n <= FPV_LENS_MAX ? n : FPV_LENS_DEFAULT;
    } catch {
      return FPV_LENS_DEFAULT;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('tg.fpvLens', String(fpvLens));
    } catch {
      /* private mode: just don't remember it */
    }
  }, [fpvLens]);
  const [povZoom, setPovZoom] = useState<Record<FlyPov, number>>(() => {
    const base: Record<FlyPov, number> = { fpv: 1, chase: 1, above: 1, side: 1, spectator: 1 };
    try {
      const saved = JSON.parse(localStorage.getItem('tg.povZoom') || '{}');
      for (const p of FLY_POVS) if (typeof saved[p.id] === 'number') base[p.id] = clampZoom(saved[p.id]);
    } catch {
      /* ignore */
    }
    return base;
  });
  useEffect(() => {
    try {
      localStorage.setItem('tg.povZoom', JSON.stringify(povZoom));
    } catch {
      /* private mode: just don't remember it */
    }
  }, [povZoom]);
  /** Zoom the current view. factor < 1 zooms in. In FPV this narrows or widens the lens. */
  const zoomView = useCallback(
    (factor: number) => {
      if (flyPov === 'fpv') setFpvLens((l) => clampLens(l * Math.sqrt(factor))); // the lens swings fast, so half-strength
      else setPovZoom((z) => ({ ...z, [flyPov]: clampZoom(z[flyPov] * factor) }));
    },
    [flyPov]
  );
  const resetZoom = () => {
    if (flyPov === 'fpv') setFpvLens(FPV_LENS_DEFAULT);
    else setPovZoom((z) => ({ ...z, [flyPov]: 1 }));
  };

  // Mouse wheel, trackpad and two-finger pinch zoom the fly-through view
  const flyAreaRef = useRef<HTMLDivElement>(null);
  const zoomViewRef = useRef(zoomView);
  zoomViewRef.current = zoomView;
  const [playing, setPlaying] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const justDraggedRef = useRef(false);
  const controlsRef = useRef<any>(null);

  // ---------------- Race line editing ----------------
  const [editLine, setEditLine] = useState(false);
  const [ctrl, setCtrl] = useState<RaceLineControls>({ points: [], closed: false });
  const ctrlRef = useRef(ctrl);
  ctrlRef.current = ctrl;
  const [selectedPt, setSelectedPt] = useState<number | null>(null);
  // Every line this editor produced; anything else in drawnPath came from outside (undo, 2D, load)
  const writtenPathsRef = useRef(new WeakSet<TrackPoint[]>());
  const pointDragRef = useRef<PointDragState | null>(null);

  // Re-derive control points whenever the line changes from outside (undo/redo, 2D drawing, loading a track)
  useEffect(() => {
    if (!editLine || writtenPathsRef.current.has(drawnPath)) return;
    setCtrl(pathToControls(drawnPath, closeDrawnLoop));
    setSelectedPt(null);
  }, [editLine, drawnPath, closeDrawnLoop]);

  // Selecting a gate drops the point selection (so Delete only affects one thing)
  useEffect(() => {
    if (selectedItemId) setSelectedPt(null);
  }, [selectedItemId]);

  const writeCtrl = useCallback(
    (next: RaceLineControls) => {
      ctrlRef.current = next;
      setCtrl(next);
      const path = controlsToPath(next, drawnPathColor);
      writtenPathsRef.current.add(path);
      onPathChange(path);
    },
    [drawnPathColor, onPathChange]
  );
  const commitOnce = useCallback(
    (next: RaceLineControls) => {
      onPathEditStart();
      writeCtrl(next);
      onPathEditEnd();
    },
    [onPathEditStart, writeCtrl, onPathEditEnd]
  );

  const toggleEditLine = () => {
    if (editLine) {
      setEditLine(false);
      setSelectedPt(null);
      return;
    }
    setCameraMode('orbit');
    onSelectItem(null);
    if (drawnPath.length < 2) {
      // Start from the automatic line through the gates
      const auto = generateCurvedPathFromGates(items, closeLoop);
      if (auto.length < 2) return;
      commitOnce(pathToControls(auto, false));
    }
    setEditLine(true);
  };

  const deletePoint = useCallback(
    (i: number) => {
      const c = ctrlRef.current;
      if (c.points.length <= 2) return;
      const points = c.points.filter((_, j) => j !== i);
      commitOnce({ points, closed: c.closed && points.length > 2 });
      setSelectedPt(null);
    },
    [commitOnce]
  );
  const setPointHeight = (i: number, z: number, mode: 'once' | 'live') => {
    const c = ctrlRef.current;
    const next = { ...c, points: c.points.map((p, j) => (j === i ? { ...p, z: clampAlt(Number(z.toFixed(2))) } : p)) };
    if (mode === 'once') commitOnce(next);
    else writeCtrl(next);
  };

  useEffect(() => {
    if (!editLine || selectedPt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deletePoint(selectedPt);
      } else if (e.key === 'Escape') {
        setSelectedPt(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editLine, selectedPt, deletePoint]);

  useEffect(() => {
    const el = flyAreaRef.current;
    if (!el || cameraMode !== 'fpv') return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;
      e.preventDefault();
      zoomViewRef.current(Math.exp(THREE.MathUtils.clamp(e.deltaY, -100, 100) * 0.001));
    };
    const touches = new Map<number, { x: number; y: number }>();
    let lastSpread = 0;
    const spread = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) lastSpread = spread();
    };
    const onMove = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2) return;
      const now = spread();
      if (lastSpread > 0 && now > 0) zoomViewRef.current(lastSpread / now); // fingers apart = zoom in
      lastSpread = now;
    };
    const onUp = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      lastSpread = touches.size === 2 ? spread() : 0;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [cameraMode]);

  // V cycles the fly-through point of view
  useEffect(() => {
    if (cameraMode !== 'fpv') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') return zoomViewRef.current(0.85);
      if (e.key === '-' || e.key === '_') return zoomViewRef.current(1 / 0.85);
      if (e.key !== 'v' && e.key !== 'V') return;
      setFlyPov((cur) => {
        const i = FLY_POVS.findIndex((p) => p.id === cur);
        const step = e.shiftKey ? -1 : 1;
        return FLY_POVS[(i + step + FLY_POVS.length) % FLY_POVS.length].id;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cameraMode]);

  const handleGrabPoint = (i: number, e: ThreeEvent<PointerEvent>) => {
    const p = ctrlRef.current.points[i];
    if (!p) return;
    const d = makePointDrag(i, p, e);
    if (!d) return;
    pointDragRef.current = d;
    setSelectedPt(i);
    onSelectItem(null);
    if (controlsRef.current) controlsRef.current.enabled = false;
    setIsDragging(true);
  };
  const getPoint = useCallback((i: number) => ctrlRef.current.points[i], []);
  const movePoint = useCallback(
    (i: number, p: TrackPoint) => {
      const c = ctrlRef.current;
      writeCtrl({ ...c, points: c.points.map((q, j) => (j === i ? p : q)) });
    },
    [writeCtrl]
  );
  const endPointDrag = useCallback(
    (didMove: boolean) => {
      setIsDragging(false);
      if (controlsRef.current) controlsRef.current.enabled = true;
      if (didMove) {
        justDraggedRef.current = true;
        onPathEditEnd();
      }
    },
    [onPathEditEnd]
  );
  // ---- Go around / through the selected flag or gate ----
  const [fullOrbit, setFullOrbit] = useState(false);
  const selectedItem = editLine && selectedItemId ? items.find((it) => it.id === selectedItemId) ?? null : null;
  const selectedEquip = selectedItem ? EQUIPMENT_MAP.get(selectedItem.equipId) : undefined;
  const aroundTargetFor = (item: PlacedItem): AroundTarget => {
    const eq = EQUIPMENT_MAP.get(item.equipId);
    const ith = eq?.resizable && item.sizeH ? item.sizeH : tierHeightOf(eq);
    const rad = (item.rotation * Math.PI) / 180;
    const tier = targetTierIndex(item);
    let passZ = DEFAULT_LINE_ALT;
    switch (eq?.visualType) {
      case 'single_gate_blue':
      case 'single_gate_lightblue':
        passZ = ith * 0.55;
        break;
      case 'vertical_double':
      case 'vertical_triple':
      case 'vertical_quad':
      case 'double_cube':
        passZ = ((tier ?? 0) + 0.5) * ith; // middle of the chosen tier
        break;
      case 'cube_gate':
      case 'round_gate':
      case 'container':
        passZ = (itemDims(item, eq).h ?? ith) / 2;
        break;
    }
    passZ += item.elevation ?? 0;
    return {
      x: item.x,
      y: item.y,
      radius: Math.max(eq?.width ?? 1, eq?.depth ?? 1) / 2 + 1.6,
      passZ,
      forwardX: -Math.sin(rad),
      forwardY: Math.cos(rad),
    };
  };
  const applyAround = (mode: AroundMode) => {
    if (!selectedItem) return;
    commitOnce(shapeAround(ctrlRef.current, aroundTargetFor(selectedItem), mode, mode !== 0 && fullOrbit));
    setSelectedPt(null);
  };

  const insertPoint = (p: TrackPoint) => {
    const c = ctrlRef.current;
    const idx = insertIndexFor(c, p);
    const z = clampAlt(p.z ?? DEFAULT_LINE_ALT);
    const points = [...c.points.slice(0, idx), { x: p.x, y: p.y, z }, ...c.points.slice(idx)];
    commitOnce({ ...c, points });
    setSelectedPt(idx);
    onSelectItem(null);
  };

  const handleGrab = (item: PlacedItem, e: ThreeEvent<PointerEvent>) => {
    // Locked pieces can be selected but not dragged. While editing the race line every gate stays
    // put, so a stray tap on a gate only selects it (for "go around / through") instead of moving it.
    if (cameraMode !== 'orbit' || item.locked || editLine) return;
    const grab = new THREE.Vector3();
    if (!e.ray.intersectPlane(GROUND_PLANE, grab)) return;
    dragRef.current = {
      id: item.id,
      offX: item.x - (grab.x + (FIELD_WIDTH_M / 2)),
      offY: item.y - (grab.z + (FIELD_HEIGHT_M / 2)),
      startClientX: e.nativeEvent.clientX,
      startClientY: e.nativeEvent.clientY,
      started: false,
    };
    // Freeze the orbit camera right away: it sees this same pointerdown, and a React re-render is too late
    if (controlsRef.current) controlsRef.current.enabled = false;
    setIsDragging(true);
  };
  const handleDragEnd = React.useCallback(
    (didMove: boolean) => {
      setIsDragging(false);
      if (controlsRef.current) controlsRef.current.enabled = true;
      if (didMove) {
        justDraggedRef.current = true;
        onMoveItemEnd();
      }
    },
    [onMoveItemEnd]
  );

  // Use the hand-drawn race line when there is one, otherwise the auto-generated 3D line through the gates
  const usingDrawn = drawnPath.length >= 2;
  const flightPoints = useMemo(() => {
    let pts: TrackPoint[];
    if (usingDrawn) {
      pts = closeDrawnLoop ? [...drawnPath, drawnPath[0]] : drawnPath;
    } else {
      pts = generateCurvedPathFromGates(items, closeLoop);
    }
    return pts.map((p) => toV3(p.x, p.y, p.z ?? DEFAULT_FLIGHT_ALT));
  }, [usingDrawn, drawnPath, closeDrawnLoop, items, closeLoop]);

  const shadowPoints = useMemo(() => flightPoints.map((p) => new THREE.Vector3(p.x, 0.04, p.z)), [flightPoints]);
  const hasPath = flightPoints.length >= 2;

  // ---------------- Video export ----------------
  const flightDistRef = useRef(0);
  const lapLength = useMemo(() => {
    let d = 0;
    for (let i = 1; i < flightPoints.length; i++) d += flightPoints[i].distanceTo(flightPoints[i - 1]);
    return d;
  }, [flightPoints]);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [exportStage, setExportStage] = useState<'idle' | 'rendering' | 'saving'>('idle');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportCancelRef = useRef(false);
  const videoSupported = useMemo(() => canExportVideo(), []);
  const startExport = () => {
    if (!hasPath || lapLength <= 0 || exportJob || droneSpeedKmH <= 0) return;
    flightDistRef.current = 0; // every video starts at the start line
    setPlaying(true);
    setEditLine(false);
    setSelectedPt(null);
    exportCancelRef.current = false;
    setExportError(null);
    setExportProgress(0);
    // 60 fps on computers; 30 on phones so a long lap doesn't take ages to export
    const fps = isNativeApp() ? 30 : 60;
    const lapSeconds = lapLength / (droneSpeedKmH / 3.6);
    setExportJob({ id: Date.now(), fps, frames: Math.max(1, Math.ceil(lapSeconds * fps)) });
    setExportStage('rendering');
  };
  const finishExport = async (r: ExportResult) => {
    setExportJob(null);
    if (r.blob) {
      setExportStage('saving');
      try {
        await saveFile(r.blob, `${fileSlug(groundName)}-flight.mp4`);
      } catch (err) {
        setExportError(`Could not save the video: ${String((err as Error)?.message ?? err)}`);
      }
    } else if (r.error) {
      setExportError(`Could not export the video: ${r.error}`);
    }
    setExportStage('idle');
  };
  // Leaving the 3D view mid-export drops it
  useEffect(() => () => void (exportCancelRef.current = true), []);
  const exportPct = Math.min(99, Math.floor(exportProgress * 100));
  const groundMark: GroundMarkSource = groundPaint ?? groundName;
  const sceneryMoves = useSceneryMotionSetting();
  const gfx = useGraphicsQuality();
  // Re-read on every render so a theme switch (themeId prop) recolours the scene
  const fc = fieldColors();
  const narrowViewport = useMediaMatch('(max-width: 767px)');
  void themeId;
  const pathColor = usingDrawn ? drawnPathColor : fc.autoPath;

  return (
    <div
      ref={flyAreaRef}
      className={`tg-field3d absolute inset-0 ${placingEquipId ? 'cursor-crosshair' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const equipId = e.dataTransfer.getData('text/plain');
        if (!equipId || !EQUIPMENT_MAP.has(equipId)) return;
        const p = groundAtClient(e.clientX, e.clientY);
        if (p) onPlaceAt(equipId, p.x, p.y);
      }}
    >
      <Canvas
        frameloop={exportJob ? 'never' : 'always'}
        camera={{ position: defaultCameraPos(), fov: 50, near: 0.05, far: 500 * fieldScale() }}
        dpr={[1, fc.style === 'coast' && narrowViewport ? 1.25 : 2]}
        onPointerMissed={() => {
          // A drag that ends off the gate shouldn't count as a click on empty space
          if (justDraggedRef.current) {
            justDraggedRef.current = false;
            return;
          }
          onSelectItem(null);
          setSelectedPt(null);
        }}
      >
        <color attach="background" args={[fc.sceneBg]} />
        {fc.style === 'trading' ? (
          <>
            {/* Trading Floor: flat and dark; candlesticks rise and fall around the field */}
            <fog attach="fog" args={['#0B0E11', 90 * fieldScale(), 260 * fieldScale()]} />
            <ambientLight intensity={0.55} color="#FFFFFF" />
            <hemisphereLight args={['#EAECEF', '#0B0E11', 0.6]} />
            <directionalLight position={[-20, 50, 30]} userData={{ sunDir: [-20, 50, 30] }} intensity={1.0} color="#FFFFFF" />
            <TradingField groundName="" fc={fc} />
            <TradingFloorWorld scale={fieldScale()} />
          </>
        ) : fc.style === 'showroom' ? (
          <>
            {/* Showroom: soft, even studio light over polished concrete; a hazy city far away */}
            <fog attach="fog" args={[SHOWROOM.scene.fog, 120 * fieldScale(), 380 * fieldScale()]} />
            <ambientLight intensity={0.7} color="#FFFFFF" />
            <hemisphereLight args={['#F4F5F7', '#6E7177', 0.75]} />
            <directionalLight position={[-30, 60, 40]} userData={{ sunDir: [-30, 60, 40] }} intensity={1.15} color="#FFF8EE" />
            <directionalLight position={[40, 30, -30]} intensity={0.35} color="#E6EEFF" />
            <ShowroomField groundName="" fc={fc} />
            <ShowroomWorld scale={fieldScale()} />
          </>
        ) : fc.style === 'coast' ? (
          <>
            {/* Coastal Sunset: golden hour over the waterfront; the sun sits low behind the city */}
            <fog attach="fog" args={[COASTAL_SUNSET.scene.fog, 140 * fieldScale(), 400 * fieldScale()]} />
            <ambientLight intensity={0.42} color="#E6D6EE" />
            <hemisphereLight args={['#FFC59A', '#1E5A6A', 0.8]} />
            <directionalLight position={[SUN_DIR.x * 120, 30, SUN_DIR.z * 120]} userData={{ sunDir: [SUN_DIR.x * 120, 30, SUN_DIR.z * 120] }} intensity={1.9} color="#FFB27A" />
            <directionalLight position={[30, 22, 40]} intensity={0.45} color="#FF79B8" />
            <CoastalField groundName="" fc={fc} />
            <CoastalSunsetWorld scale={fieldScale()} fogNear={140} fogFar={400} />
          </>
        ) : fc.style === 'desert' ? (
          <>
            {/* Desert Site: clear morning, sun low in the south-east (field +X), haze on the horizon */}
            {/* Haze: nothing nearby, thickening to the horizon colour of the sky */}
            <fog attach="fog" args={[DESERT_SKY.horizon, 220, 2200]} />
            {/* Most of the fill light comes from the sky itself (SkyDome bakes it into the scene's lighting) */}
            <ambientLight intensity={0.12} color="#FFF4E2" />
            <hemisphereLight args={['#DCE6EE', '#A8957A', 0.28]} />
            <directionalLight position={DESERT_SKY.sunDir} userData={{ sunDir: DESERT_SKY.sunDir }} intensity={2.3} color="#FFEBCB" />
            <SkyDome spec={DESERT_SKY} lightScene envIntensity={0.75} />
            <DesertField groundName="" fc={fc} />
            <DesertWorld scale={fieldScale()} />
          </>
        ) : fc.style === 'dock' ? (
          <>
            {/* Animated look: a sunken city under the sea */}
            <fog attach="fog" args={[SUNKEN_FOG.color, SUNKEN_FOG.near * fieldScale(), SUNKEN_FOG.far * fieldScale()]} />
            <ambientLight intensity={0.35} color="#8FE0D6" />
            <hemisphereLight args={['#C8FFF4', '#062228', 0.55]} />
            <directionalLight position={[-12, 50, 8]} userData={{ sunDir: [-12, 50, 8] }} intensity={1.5} color="#FFF4DC" />
            <SunkenDeck groundName="" fc={fc} />
            <SunkenCity scale={fieldScale()} />
          </>
        ) : (
          <>
            <fog attach="fog" args={[fc.sceneBg, 70 * fieldScale(), 160 * fieldScale()]} />
            <ambientLight intensity={0.55} />
            <hemisphereLight args={[fc.hemiSky, fc.hemiGround, 0.5]} />
            <directionalLight position={[20, 40, 15]} userData={{ sunDir: [20, 40, 15] }} intensity={1.1} />
            <FieldGround groundName="" fc={fc} />
          </>
        )}
        {/* Graphics quality: real sun shadows, glow, ambient occlusion and film tone mapping */}
        {gfx !== 'low' && <SunShadows key={`${gfx}-${fc.style}`} mapSize={gfx === 'high' ? 4096 : 2048} />}
        {gfx !== 'low' && <PostFX high={gfx === 'high'} />}

        {/* Ground marking on its own layer, above the turf, roads and grass (not baked into the ground) */}
        <GroundMarkOverlay mark={groundMark} fill={MARK_FILL[fc.style ?? 'flat'] ?? MARK_FILL.flat} />
        <CameraGrabber target={cameraRef} />

        {/* Placing: a catcher over the whole ground plus a preview of the piece under the cursor */}
        {placingEquipId && cameraMode === 'orbit' && (
          <>
            <mesh
              rotation-x={-Math.PI / 2}
              position-y={0.02}
              userData={{ noExport: true }}
              onPointerMove={(e: ThreeEvent<PointerEvent>) => {
                setGhostPos(snapField(e.point.x + FIELD_WIDTH_M / 2, e.point.z + FIELD_HEIGHT_M / 2));
              }}
              onPointerOut={() => setGhostPos(null)}
              onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                if (e.button === 0) placeDownRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
              }}
              onPointerUp={(e: ThreeEvent<PointerEvent>) => {
                const d = placeDownRef.current;
                placeDownRef.current = null;
                // A press and release in (almost) the same spot places; a drag orbits the camera instead
                if (!d || Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) > 5) return;
                e.stopPropagation();
                onPlaceAt(placingEquipId, e.point.x + FIELD_WIDTH_M / 2, e.point.z + FIELD_HEIGHT_M / 2);
              }}
            >
              <planeGeometry args={[FIELD_WIDTH_M, FIELD_HEIGHT_M]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {ghostPos && (
              <group
                position={toV3(ghostPos.x, ghostPos.y, 0)}
                rotation-y={(-placementYaw * Math.PI) / 180}
                userData={{ noExport: true }}
              >
                <GateModel
                  item={{ id: 'ghost', equipId: placingEquipId, x: ghostPos.x, y: ghostPos.y, rotation: placementYaw, sequenceOrder: null }}
                  selected
                />
                <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
                  <ringGeometry args={[1.4, 1.6, 40]} />
                  <meshBasicMaterial color="#38bdf8" transparent opacity={0.7} />
                </mesh>
              </group>
            )}
          </>
        )}

        {items.map((item) => (
          <PlacedGate
            key={item.id}
            item={item}
            selected={item.id === selectedItemId}
            onSelect={onSelectItem}
            onGrab={handleGrab}
          />
        ))}

        {hasPath && (
          <>
            {/* In FPV the camera rides on the line itself, so hide it to keep the view clear */}
            {!(cameraMode === 'fpv' && flyPov === 'fpv') && (
              <Line points={flightPoints} color={pathColor} lineWidth={2.5} transparent opacity={cameraMode === 'fpv' ? 0.55 : 1} />
            )}
            <Line points={shadowPoints} color={pathColor} lineWidth={1} transparent opacity={cameraMode === 'fpv' ? 0.6 : 0.25} />
            <Drone
              points={flightPoints}
              speedMs={droneSpeedKmH / 3.6}
              playing={playing}
              cameraMode={cameraMode}
              pov={flyPov}
              fpvLens={fpvLens}
              zoom={povZoom[flyPov]}
              distRef={flightDistRef}
              restartKey={exportJob?.id}
            />
          </>
        )}

        {editLine && cameraMode === 'orbit' && (
          <RaceLineHandles
            ctrl={ctrl}
            selected={selectedPt}
            color={pathColor}
            onSelect={(i) => {
              setSelectedPt(i);
              onSelectItem(null);
            }}
            onGrabPoint={handleGrabPoint}
            onInsert={insertPoint}
          />
        )}

        <OrbitRig active={cameraMode === 'orbit'} enabled={!isDragging} controlsRef={controlsRef} />
        <ExportDriver job={exportJob} cancelRef={exportCancelRef} onProgress={setExportProgress} onFinish={finishExport} />
        <SceneExporter
          request={exportRequest}
          flight={flightPoints}
          pathColor={pathColor}
          groundName={groundName}
          onDone={onExportDone}
        />
        <PointDragManager
          dragRef={pointDragRef}
          getPoint={getPoint}
          onStart={onPathEditStart}
          onMove={movePoint}
          onEnd={endPointDrag}
        />
        <DragManager
          dragRef={dragRef}
          onMoveItemStart={onMoveItemStart}
          onMoveItem={onMoveItem}
          onEnd={handleDragEnd}
        />
      </Canvas>

      {/* Race line editor panel */}
      {editLine && (
        <div
          className={`absolute bottom-[7.25rem] z-20 compact:bottom-14 compact:left-2 compact:right-2 compact:w-auto compact:max-w-none compact:translate-x-0 compact:max-h-[45%] compact:overflow-y-auto ${
            selectedItem
              ? 'left-4 right-[21.5rem] max-w-[34rem]' // keep clear of the gate inspector on the right
              : 'left-1/2 -translate-x-1/2 w-[min(34rem,calc(100%-2rem))]'
          } bg-tg-panel/95 border border-slate-700 rounded-xl p-2.5 shadow-2xl font-mono text-[11px] text-slate-300 space-y-2`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sky-300 font-bold">
              Race line · {ctrl.points.length} points
              <span className="ml-2 font-normal text-slate-400" title="Gates can't be moved while you edit the line">
                🔒 gates fixed
              </span>
            </span>
            <button
              onClick={() => commitOnce({ ...ctrl, closed: !ctrl.closed })}
              disabled={ctrl.points.length < 3}
              className="px-2 py-1 rounded-lg border border-slate-700 hover:border-sky-500/60 hover:text-sky-200 disabled:opacity-40"
              title="Join the end of the line back to the start"
            >
              {ctrl.closed ? 'Loop: on' : 'Loop: off'}
            </button>
          </div>
          {selectedItem && selectedEquip && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-yellow-300 font-bold whitespace-nowrap">
                {selectedItem.sequenceOrder ? `#${selectedItem.sequenceOrder} ` : ''}
                {selectedEquip.shortName}
              </span>
              <span className="text-slate-500">Line:</span>
              <button
                onClick={() => applyAround(1)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-700 hover:border-yellow-400/60 hover:text-yellow-200"
                title="Fly around it clockwise (as seen from above)"
              >
                <RotateCw className="w-3 h-3" /> Around ↻
              </button>
              <button
                onClick={() => applyAround(-1)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-700 hover:border-yellow-400/60 hover:text-yellow-200"
                title="Fly around it anticlockwise (as seen from above)"
              >
                <RotateCcw className="w-3 h-3" /> Around ↺
              </button>
              {selectedEquip.visualType !== 'flag_pole' && (
                <button
                  onClick={() => applyAround(0)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-700 hover:border-yellow-400/60 hover:text-yellow-200"
                  title="Fly straight through it (stacked gates: through the target tier)"
                >
                  <ArrowRight className="w-3 h-3" /> Through
                </button>
              )}
              <label className="flex items-center gap-1 ml-1 text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fullOrbit}
                  onChange={(e) => setFullOrbit(e.target.checked)}
                  className="accent-yellow-300"
                />
                Full orbit
              </label>
            </div>
          )}
          {selectedPt !== null && ctrl.points[selectedPt] ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-yellow-300 font-bold whitespace-nowrap">Point {selectedPt + 1}</span>
              <span className="text-slate-500">Height</span>
              <button
                onClick={() => setPointHeight(selectedPt, (ctrl.points[selectedPt].z ?? DEFAULT_LINE_ALT) - 0.5, 'once')}
                className="p-1 rounded border border-slate-700 hover:border-sky-500/60"
                title="Lower 0.5 m"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={MIN_LINE_ALT}
                max={MAX_LINE_ALT}
                step={0.1}
                value={ctrl.points[selectedPt].z ?? DEFAULT_LINE_ALT}
                onPointerDown={onPathEditStart}
                onPointerUp={onPathEditEnd}
                onChange={(e) => setPointHeight(selectedPt, Number(e.target.value), 'live')}
                className="flex-1 min-w-[6rem] accent-yellow-300"
              />
              <button
                onClick={() => setPointHeight(selectedPt, (ctrl.points[selectedPt].z ?? DEFAULT_LINE_ALT) + 0.5, 'once')}
                className="p-1 rounded border border-slate-700 hover:border-sky-500/60"
                title="Raise 0.5 m"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="w-12 text-right text-yellow-200">
                {(ctrl.points[selectedPt].z ?? DEFAULT_LINE_ALT).toFixed(1)} m
              </span>
              <button
                onClick={() => deletePoint(selectedPt)}
                disabled={ctrl.points.length <= 2}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                title="Delete point (Delete key)"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          ) : (
            <p className="text-slate-500 leading-relaxed">
              Drag a point to move it · <span className="text-slate-300">Shift + drag</span> to change its height ·
              Click the line to add a point · Click a point to set height or delete it · Click a flag or gate to
              send the line around it
            </p>
          )}
        </div>
      )}

      {/* Fly-through point of view */}
      {cameraMode === 'fpv' && hasPath && (
        <div
          role="radiogroup"
          aria-label="Fly-through point of view"
          className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-tg-panel/95 border border-slate-700 rounded-xl p-1 shadow-2xl font-mono text-[11px] whitespace-nowrap compact:bottom-14 compact:left-auto compact:right-2 compact:translate-x-0 compact:max-w-[calc(100%-8.75rem)] compact:overflow-x-auto no-scrollbar"
        >
          <span className="pl-2 pr-1 text-slate-500">View</span>
          {FLY_POVS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={flyPov === p.id}
              onClick={() => setFlyPov(p.id)}
              title={`${p.title} (V to switch)`}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                flyPov === p.id ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50' : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {p.label}
            </button>
          ))}
          {flyPov === 'fpv' && (
            <>
              <span className="w-px h-5 bg-slate-700 mx-1" />
              <label
                className="flex items-center gap-2 px-2 text-slate-400"
                title="Camera lens: wide angle (150°) on the left, normal racing lens on the right"
              >
                <span>Lens</span>
                <span className="text-slate-500">Wide</span>
                <input
                  type="range"
                  min={FPV_LENS_MIN}
                  max={FPV_LENS_MAX}
                  step={5}
                  // Wide on the left, like zooming out
                  value={FPV_LENS_MAX + FPV_LENS_MIN - fpvLens}
                  onChange={(e) => setFpvLens(FPV_LENS_MAX + FPV_LENS_MIN - Number(e.target.value))}
                  onDoubleClick={() => setFpvLens(FPV_LENS_DEFAULT)}
                  aria-label="FPV camera field of view"
                  aria-valuetext={`${fpvLens} degrees`}
                  className="w-24 accent-sky-400 cursor-pointer"
                />
                <span className="text-slate-500">Normal</span>
                <span className="w-9 text-right text-sky-300 tabular-nums">{fpvLens}°</span>
              </label>
            </>
          )}
          {flyPov !== 'fpv' && (
            <>
              <span className="w-px h-5 bg-slate-700 mx-1" />
              <button
                onClick={() => zoomView(1 / 0.8)}
                disabled={povZoom[flyPov] >= POV_ZOOM_MAX}
                title="Zoom out (scroll, pinch or − key)"
                aria-label="Zoom out"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white disabled:opacity-40"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={resetZoom}
                title="Back to normal distance"
                className="w-11 text-center text-sky-300 tabular-nums hover:text-white"
              >
                {Math.round((1 / povZoom[flyPov]) * 100)}%
              </button>
              <button
                onClick={() => zoomView(0.8)}
                disabled={povZoom[flyPov] <= POV_ZOOM_MIN}
                title="Zoom in (scroll, pinch or + key)"
                aria-label="Zoom in"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {exportError && (
        <button
          onClick={() => setExportError(null)}
          className="absolute bottom-40 left-1/2 -translate-x-1/2 z-30 max-w-[90%] px-3 py-2 rounded-lg bg-red-950/90 border border-red-500/60 text-red-100 text-xs font-mono shadow-2xl"
          title="Dismiss"
        >
          {exportError}
        </button>
      )}

      {/* 3D view controls */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-tg-panel/95 border border-slate-700 rounded-xl p-1 shadow-2xl font-mono text-[11px] whitespace-nowrap compact:bottom-2 compact:left-auto compact:right-2 compact:translate-x-0 compact:max-w-[calc(100%-8.75rem)] compact:overflow-x-auto no-scrollbar">
        <button
          onClick={() => setCameraMode('orbit')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition ${
            cameraMode === 'orbit' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50' : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
          title="Drag to orbit, scroll to zoom, right-drag to pan"
        >
          <Orbit className="w-3.5 h-3.5" /> Orbit
        </button>
        <button
          onClick={() => {
            setCameraMode('fpv');
            setEditLine(false);
            setSelectedPt(null);
          }}
          disabled={!hasPath}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40 ${
            cameraMode === 'fpv' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50' : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
          title="Ride along the flight line at the selected speed"
        >
          <Eye className="w-3.5 h-3.5" /> Fly-through
        </button>
        <span className="w-px h-5 bg-slate-700 mx-1" />
        <button
          onClick={toggleEditLine}
          disabled={!hasPath}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40 ${
            editLine ? 'bg-yellow-400/15 text-yellow-200 border border-yellow-400/50' : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
          title="Shape the race line: move points, change heights, add or delete points"
        >
          <Spline className="w-3.5 h-3.5" /> {editLine ? 'Done' : 'Edit line'}
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={!hasPath}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white disabled:opacity-40"
          title={playing ? 'Pause drone' : 'Play drone'}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {playing ? 'Pause' : 'Play'}
        </button>
        {(fc.style === 'dock' || fc.style === 'coast' || fc.style === 'trading') && (
          <button
            onClick={() => setSceneryMotion(!sceneryMoves)}
            aria-pressed={sceneryMoves}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition ${
              sceneryMoves ? 'text-slate-300 hover:text-white' : 'text-amber-300 bg-amber-400/10 border border-amber-400/40'
            }`}
            title={sceneryMoves ? 'Stop the scenery moving (water, palms, birds, boats). The drone keeps flying.' : 'Let the scenery move again'}
          >
            <Wind className="w-3.5 h-3.5" /> {sceneryMoves ? 'Scenery on' : 'Scenery still'}
          </button>
        )}
        <span className="w-px h-5 bg-slate-700 mx-1" />
        {exportStage === 'rendering' ? (
          <button
            onClick={() => (exportCancelRef.current = true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/20 text-red-200 border border-red-500/60"
            title="Cancel the export"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Exporting lap… {exportPct}%
            <Square className="w-3 h-3 fill-current ml-1" />
          </button>
        ) : exportStage === 'saving' ? (
          <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving video…
          </span>
        ) : (
          <button
            onClick={startExport}
            disabled={!hasPath || !videoSupported || droneSpeedKmH <= 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white disabled:opacity-40"
            title={
              droneSpeedKmH <= 0
                ? 'Set a speed above 0 km/h to export a lap'
                : videoSupported
                ? `Export one lap as a smooth MP4 video, in this view at ${droneSpeedKmH} km/h`
                : 'Video export is not supported on this device'
            }
          >
            <Video className="w-3.5 h-3.5" /> Export video
          </button>
        )}
        <span className="pl-1 pr-2 text-slate-500 hidden xl:inline">
          {usingDrawn ? 'Drawn line' : 'Auto line'} · {droneSpeedKmH} km/h
        </span>
      </div>
    </div>
  );
}
