import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowRight, Eye, Minus, Orbit, Pause, Play, Plus, RotateCcw, RotateCw, Spline, Trash2 } from 'lucide-react';
import { EquipmentDef, PlacedItem, TrackPoint } from '../types';
import { EQUIPMENT_MAP, FIELD_HEIGHT_M, FIELD_WIDTH_M, PERIMETER_FENCE_M } from '../constants/equipment';
import { generateCurvedPathFromGates, snapCoord } from '../utils/trackMath';
import { SceneExporter, Export3DRequest } from './SceneExporter';
import { drawWatermarkText } from '../utils/watermark';
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

/** Ground name painted faintly across the turf, like a watermark on a blueprint. */
function useWatermarkTexture(name: string) {
  return useMemo(() => {
    const pxPerM = 24;
    const w = Math.round(FIELD_WIDTH_M * pxPerM);
    const h = Math.round(FIELD_HEIGHT_M * pxPerM);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx && name.trim()) {
      drawWatermarkText(ctx, name, w, h, 'rgba(203, 213, 225, 0.10)');
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }, [name]);
}

function FieldGround({ groundName }: { groundName: string }) {
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
        <meshStandardMaterial color="#05080e" />
      </mesh>
      {/* Field turf */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[FIELD_WIDTH_M, FIELD_HEIGHT_M]} />
        <meshStandardMaterial color="#0f1c1a" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
        <planeGeometry args={[FIELD_WIDTH_M, FIELD_HEIGHT_M]} />
        <meshBasicMaterial map={watermark} transparent depthWrite={false} />
      </mesh>
      <lineSegments geometry={gridGeom}>
        <lineBasicMaterial color="#1f3b3a" transparent opacity={0.8} />
      </lineSegments>
      <Line points={border} color="#334155" lineWidth={1.5} />
      <Line points={fence} color="#f59e0b" lineWidth={2} dashed dashSize={0.8} gapSize={0.5} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Gate building blocks (local frame: X = gate width, Y = up, Z = flight direction)
// ---------------------------------------------------------------------------
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
  if (t === 'tier1' || t === 1 || t === 'ladder_up') return 0;
  if (t === 'tier2' || t === 2) return 1;
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

function GateModel({ item, selected }: { item: PlacedItem; selected: boolean }) {
  const equip = EQUIPMENT_MAP.get(item.equipId);
  if (!equip) return null;
  const c = selected ? '#fde047' : equip.isCustom ? equip.color : equip.borderColor;
  const base = selected ? 0.9 : 0.35;
  const target = targetTierIndex(item);
  const tierGlow = (i: number) => (target === i ? 1.2 : base);
  const w = equip.width;
  const th = tierHeightOf(equip);

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
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
          <mesh position={[0.35, th - bannerH / 2 - 0.05, 0]}>
            <boxGeometry args={[0.7, bannerH, 0.03]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={base} side={THREE.DoubleSide} />
          </mesh>
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
    default:
      return null;
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
  const pos = toV3(item.x, item.y, 0);
  const yaw = (item.rotation * Math.PI) / 180;
  const pitch = ((item.pitch ?? 0) * Math.PI) / 180;
  const roll = ((item.roll ?? 0) * Math.PI) / 180;
  const equip = EQUIPMENT_MAP.get(item.equipId);
  const topY = topOf(equip);

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
        <GateModel item={item} selected={selected} />
        {/* Invisible, generous hit box so thin frames are easy to click */}
        <mesh position={[0, topY / 2, 0]} visible={false}>
          <boxGeometry args={[Math.max(1, equip?.width ?? 1) + 0.4, topY, Math.max(0.8, equip?.depth ?? 0.8)]} />
        </mesh>
      </group>
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02} userData={{ noExport: true }}>
          <ringGeometry args={[1.4, 1.6, 40]} />
          <meshBasicMaterial color="#fde047" transparent opacity={0.8} />
        </mesh>
      )}
      {((item.sequenceOrder !== null && item.sequenceOrder > 0) || item.locked) && (
        <Html position={[0, topY + 0.6, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
              selected ? 'bg-yellow-300 text-slate-900 border-yellow-200' : 'bg-slate-900/90 text-sky-300 border-sky-500/60'
            }`}
          >
            {item.sequenceOrder}
            {item.locked && ' 🔒'}
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

function Drone({
  points,
  speedMs,
  playing,
  cameraMode,
}: {
  points: THREE.Vector3[];
  speedMs: number;
  playing: boolean;
  cameraMode: CameraMode;
}) {
  const ref = useRef<THREE.Group>(null);
  const distRef = useRef(0);
  const cum = useMemo(() => buildCumulative(points), [points]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const { camera } = useThree();

  useFrame((_, delta) => {
    if (!ref.current || points.length < 2 || cum[cum.length - 1] <= 0) return;
    if (playing) distRef.current += speedMs * Math.min(delta, 0.1);
    pointAt(points, cum, distRef.current, tmp);
    pointAt(points, cum, distRef.current + 2.5, ahead);
    ref.current.position.copy(tmp);
    ref.current.lookAt(ahead);
    if (cameraMode === 'fpv') {
      camera.position.copy(tmp).add(new THREE.Vector3(0, 0.15, 0));
      camera.lookAt(ahead.x, ahead.y + 0.1, ahead.z);
    }
  });

  return (
    <group ref={ref} visible={cameraMode !== 'fpv'}>
      <mesh>
        <boxGeometry args={[0.35, 0.08, 0.35]} />
        <meshStandardMaterial color="#f8fafc" emissive="#38bdf8" emissiveIntensity={0.8} />
      </mesh>
      <pointLight color="#38bdf8" intensity={4} distance={4} />
    </group>
  );
}

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
  target.current = { camera, dom: gl.domElement };
  return null;
}

// ---------------------------------------------------------------------------
// Main 3D view
// ---------------------------------------------------------------------------
export default function Field3D({
  groundName,
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
    const rad = (item.rotation * Math.PI) / 180;
    const tier = targetTierIndex(item);
    let passZ = DEFAULT_LINE_ALT;
    switch (eq?.visualType) {
      case 'single_gate_blue':
      case 'single_gate_lightblue':
        passZ = tierHeightOf(eq) * 0.55;
        break;
      case 'vertical_double':
      case 'vertical_triple':
      case 'vertical_quad':
      case 'double_cube':
        passZ = ((tier ?? 0) + 0.5) * tierHeightOf(eq); // middle of the chosen tier
        break;
      case 'cube_gate':
        passZ = tierHeightOf(eq) / 2;
        break;
    }
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
  const pathColor = usingDrawn ? drawnPathColor : '#22d3ee';

  return (
    <div
      className={`absolute inset-0 ${placingEquipId ? 'cursor-crosshair' : ''}`}
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
        camera={{ position: defaultCameraPos(), fov: 50, near: 0.05, far: 500 * fieldScale() }}
        dpr={[1, 2]}
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
        <color attach="background" args={['#070a12']} />
        <fog attach="fog" args={['#070a12', 70 * fieldScale(), 160 * fieldScale()]} />
        <ambientLight intensity={0.55} />
        <hemisphereLight args={['#bae6fd', '#0f172a', 0.5]} />
        <directionalLight position={[20, 40, 15]} intensity={1.1} />

        <FieldGround groundName={groundName} />
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
            {cameraMode === 'orbit' && <Line points={flightPoints} color={pathColor} lineWidth={2.5} />}
            <Line points={shadowPoints} color={pathColor} lineWidth={1} transparent opacity={cameraMode === 'fpv' ? 0.6 : 0.25} />
            <Drone
              points={flightPoints}
              speedMs={droneSpeedKmH / 3.6}
              playing={playing}
              cameraMode={cameraMode}
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
          } bg-[#090d16]/95 border border-slate-700 rounded-xl p-2.5 shadow-2xl font-mono text-[11px] text-slate-300 space-y-2`}
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

      {/* 3D view controls */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-[#090d16]/95 border border-slate-700 rounded-xl p-1 shadow-2xl font-mono text-[11px] whitespace-nowrap compact:bottom-2 compact:left-auto compact:right-2 compact:translate-x-0 compact:max-w-[calc(100%-8.75rem)] compact:overflow-x-auto no-scrollbar">
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
          <Eye className="w-3.5 h-3.5" /> FPV fly-through
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
        <span className="pl-1 pr-2 text-slate-500 hidden xl:inline">
          {usingDrawn ? 'Drawn line' : 'Auto line'} · {droneSpeedKmH} km/h
        </span>
      </div>
    </div>
  );
}
