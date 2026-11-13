import * as THREE from 'three';
import { TrackPoint } from '../types';
import { FIELD_HEIGHT_M, FIELD_WIDTH_M } from '../constants/equipment';

// The race line is stored as a dense polyline (drawnPath) so the 2D map, metrics and exports keep working.
// For editing, it is reduced to a handful of control points; every edit rebuilds the dense line as a
// smooth curve through those points.

export const DEFAULT_LINE_ALT = 1.2;
export const MIN_LINE_ALT = 0.3;
export const MAX_LINE_ALT = 8;
const CLOSE_EPS = 0.3; // metres: first and last point this close means the line is a loop
const SAMPLE_SPACING = 0.5; // metres between points of the rebuilt line

export interface RaceLineControls {
  points: TrackPoint[];
  closed: boolean;
}

export const clampAlt = (z: number) => Math.min(MAX_LINE_ALT, Math.max(MIN_LINE_ALT, z));
export const clampX = (x: number) => Math.min(FIELD_WIDTH_M, Math.max(0, x));
export const clampY = (y: number) => Math.min(FIELD_HEIGHT_M, Math.max(0, y));

const dist3 = (a: TrackPoint, b: TrackPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? DEFAULT_LINE_ALT) - (b.z ?? DEFAULT_LINE_ALT));

function perpDist(p: TrackPoint, a: TrackPoint, b: TrackPoint) {
  const A = new THREE.Vector3(a.x, a.y, a.z ?? DEFAULT_LINE_ALT);
  const B = new THREE.Vector3(b.x, b.y, b.z ?? DEFAULT_LINE_ALT);
  const P = new THREE.Vector3(p.x, p.y, p.z ?? DEFAULT_LINE_ALT);
  const seg = new THREE.Line3(A, B);
  const closest = new THREE.Vector3();
  seg.closestPointToPoint(P, true, closest);
  return closest.distanceTo(P);
}

/** Ramer–Douglas–Peucker simplification in 3D. */
function simplify(points: TrackPoint[], eps: number): TrackPoint[] {
  if (points.length <= 2) return points.slice();
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, idx + 1), eps);
  const right = simplify(points.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

/** Reduce a dense race line to editable control points. */
export function pathToControls(path: TrackPoint[], forceClosed: boolean): RaceLineControls {
  let pts = path.map((p) => ({ x: p.x, y: p.y, z: clampAlt(p.z ?? DEFAULT_LINE_ALT) }));
  const loopsBack = pts.length > 2 && dist3(pts[0], pts[pts.length - 1]) < CLOSE_EPS;
  const closed = forceClosed || loopsBack;
  if (loopsBack) pts = pts.slice(0, -1);

  // Loosen the tolerance until the point count is comfortable to edit
  let eps = 0.35;
  let out = simplify(pts, eps);
  while (out.length > 40 && eps < 5) {
    eps *= 1.5;
    out = simplify(pts, eps);
  }
  // Drop near-duplicates
  out = out.filter((p, i) => i === 0 || dist3(p, out[i - 1]) > 0.4);
  return { points: out, closed: closed && out.length > 2 };
}

/** Rebuild a dense, smooth race line through the control points. */
export function controlsToPath(ctrl: RaceLineControls, color?: string): TrackPoint[] {
  const pts = ctrl.points;
  if (pts.length < 2) return pts.map((p) => ({ ...p, color }));
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p.x, p.y, p.z ?? DEFAULT_LINE_ALT)),
    ctrl.closed,
    'centripetal'
  );
  const n = Math.max(pts.length * 4, Math.ceil(curve.getLength() / SAMPLE_SPACING));
  return curve.getSpacedPoints(n).map((v) => ({
    x: Number(clampX(v.x).toFixed(3)),
    y: Number(clampY(v.y).toFixed(3)),
    z: Number(clampAlt(v.z).toFixed(3)),
    color,
  }));
}

/** Index at which a new point clicked at `p` should be inserted (nearest segment). */
export function insertIndexFor(ctrl: RaceLineControls, p: TrackPoint): number {
  const pts = ctrl.points;
  const segCount = ctrl.closed ? pts.length : pts.length - 1;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < segCount; i++) {
    const d = perpDist(p, pts[i], pts[(i + 1) % pts.length]);
    if (d < bestD) {
      bestD = d;
      best = i + 1;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Shape the line around (or through) one piece of equipment
// ---------------------------------------------------------------------------

/** 1 = clockwise as seen from above (same as on the 2D map), -1 = anticlockwise, 0 = straight through. */
export type AroundMode = 1 | -1 | 0;

export interface AroundTarget {
  x: number;
  y: number;
  radius: number; // orbit radius in metres
  passZ: number; // flying height when going through
  forwardX: number; // gate facing, used when the line has no point before/after it
  forwardY: number;
}

/**
 * Replace the stretch of line near the target with an arc around it (clockwise or anticlockwise),
 * or with a single point through its centre. Only the one contiguous stretch closest to the target
 * is changed, so a line that passes the same spot twice keeps its other pass.
 */
export function shapeAround(
  ctrl: RaceLineControls,
  t: AroundTarget,
  mode: AroundMode,
  fullOrbit = false // add one extra full lap around the target (e.g. orbiting a flag)
): RaceLineControls {
  const pts = ctrl.points;
  const n = pts.length;
  if (n < 2) return ctrl;
  const flat = (p: TrackPoint) => Math.hypot(p.x - t.x, p.y - t.y);
  const reach = t.radius + 1.5;

  // Nearest control point, then grow the stretch while points stay near the target
  let k = 0;
  for (let i = 1; i < n; i++) if (flat(pts[i]) < flat(pts[k])) k = i;

  let lo: number; // index of the last kept point before the stretch (may wrap when closed)
  let hi: number; // index of the first kept point after it
  if (flat(pts[k]) > reach) {
    // Nothing near: splice into the nearest segment
    const idx = insertIndexFor(ctrl, { x: t.x, y: t.y, z: t.passZ });
    lo = idx - 1;
    hi = idx;
  } else {
    lo = k - 1;
    hi = k + 1;
    let removed = 1;
    const maxRemove = ctrl.closed ? n - 2 : n;
    while (removed < maxRemove) {
      const li = ctrl.closed ? (lo + n) % n : lo;
      if (li < 0 || flat(pts[li]) > reach) break;
      lo--;
      removed++;
    }
    while (removed < maxRemove) {
      const hiI = ctrl.closed ? hi % n : hi;
      if (hiI >= n || flat(pts[hiI]) > reach) break;
      hi++;
      removed++;
    }
  }

  const get = (i: number): TrackPoint | null => {
    if (ctrl.closed) return pts[((i % n) + n) % n];
    return i >= 0 && i < n ? pts[i] : null;
  };
  const prev = get(lo);
  const next = get(hi);
  const zPrev = prev?.z ?? t.passZ;
  const zNext = next?.z ?? t.passZ;

  // Directions from the target to where the line comes from and goes to
  const inX = prev ? prev.x - t.x : -t.forwardX;
  const inY = prev ? prev.y - t.y : -t.forwardY;
  const outX = next ? next.x - t.x : t.forwardX;
  const outY = next ? next.y - t.y : t.forwardY;

  let middle: TrackPoint[];
  if (mode === 0) {
    middle = [{ x: t.x, y: t.y, z: clampAlt(t.passZ) }];
  } else {
    const a0 = Math.atan2(inY, inX);
    const a1 = Math.atan2(outY, outX);
    let sweep = a1 - a0;
    if (mode === 1) {
      while (sweep <= 0.2) sweep += Math.PI * 2;
    } else {
      while (sweep >= -0.2) sweep -= Math.PI * 2;
    }
    if (fullOrbit) sweep += mode * Math.PI * 2;
    const steps = Math.max(3, Math.ceil(Math.abs(sweep) / (Math.PI / 4)));
    middle = [];
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (sweep * s) / steps;
      const f = s / steps;
      middle.push({
        x: Number(clampX(t.x + Math.cos(a) * t.radius).toFixed(2)),
        y: Number(clampY(t.y + Math.sin(a) * t.radius).toFixed(2)),
        z: Number(clampAlt(zPrev + (zNext - zPrev) * f).toFixed(2)),
      });
    }
  }

  if (ctrl.closed) {
    // Walk the kept points from `next` round to `prev`, then the new stretch
    const kept: TrackPoint[] = [];
    const removedCount = hi - lo - 1;
    for (let i = 0; i < n - removedCount; i++) kept.push(pts[(((hi + i) % n) + n) % n]);
    return { points: [...kept, ...middle], closed: true };
  }
  const before = lo >= 0 ? pts.slice(0, lo + 1) : [];
  const after = hi < n ? pts.slice(hi) : [];
  return { points: [...before, ...middle, ...after], closed: false };
}
