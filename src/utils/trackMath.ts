import { MANEUVER_OPTIONS, PathSegment, PlacedItem, TrackMetrics, TrackPoint } from '../types';
import { itemDims } from '../constants/siteEquipment';
import { EQUIPMENT_MAP, FIELD_HEIGHT_M, FIELD_WIDTH_M, PERIMETER_FENCE_M } from '../constants/equipment';

export function calculateDrawnPathDistance(points: TrackPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    // Include climbs and dives when the line has heights
    const z0 = points[i].z;
    const z1 = points[i + 1].z;
    const dz = z0 !== undefined && z1 !== undefined ? z1 - z0 : 0;
    total += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return total;
}

export function calculateDrawnPathMetrics(
  drawnPath: TrackPoint[],
  items: PlacedItem[],
  droneSpeedKmH: number
): TrackMetrics {
  const totalDistance = calculateDrawnPathDistance(drawnPath);
  const orderedItems = items.filter((i) => i.sequenceOrder !== null && i.sequenceOrder > 0);

  // Speed in m/s: km/h / 3.6
  const speedMetersPerSecond = Math.max(1, (droneSpeedKmH * 1000) / 3600);
  const estimatedLapTime = totalDistance / speedMetersPerSecond;

  // Find longest quasi-straight stretch or average segment
  let maxStretch = 0;
  if (drawnPath.length >= 2) {
    let currentStretch = 0;
    for (let i = 0; i < drawnPath.length - 1; i++) {
      const dx = drawnPath[i + 1].x - drawnPath[i].x;
      const dy = drawnPath[i + 1].y - drawnPath[i].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      currentStretch += d;
      if (currentStretch > maxStretch) maxStretch = currentStretch;
    }
  }

  const averageSegment = orderedItems.length > 0 ? totalDistance / orderedItems.length : totalDistance;

  return {
    totalDistance,
    gateCount: orderedItems.length,
    longestStraight: Math.min(totalDistance, maxStretch > 0 ? maxStretch : totalDistance),
    shortestSegment: 0,
    averageSegment,
    estimatedLapTime,
    isCustomDrawn: true,
  };
}

// Chaikin's corner cutting algorithm for smooth aerodynamic racing curves
export function smoothPathPoints(points: TrackPoint[], passes: number = 1): TrackPoint[] {
  if (points.length < 3) return [...points];
  let current = [...points];

  for (let p = 0; p < passes; p++) {
    const smoothed: TrackPoint[] = [];
    smoothed.push(current[0]);

    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];

      // Q = 0.75 * p0 + 0.25 * p1
      const q: TrackPoint = {
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
        ...(p0.z !== undefined && p1.z !== undefined
          ? { z: 0.75 * p0.z + 0.25 * p1.z }
          : {}),
        color: p0.color || p1.color,
      };

      // R = 0.25 * p0 + 0.75 * p1
      const r: TrackPoint = {
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
        ...(p0.z !== undefined && p1.z !== undefined
          ? { z: 0.25 * p0.z + 0.75 * p1.z }
          : {}),
        color: p1.color || p0.color,
      };

      smoothed.push(q);
      smoothed.push(r);
    }

    smoothed.push(current[current.length - 1]);
    current = smoothed;
  }

  return current;
}

// Generate an aerodynamic curve through ordered gates, including smooth orbit loops around flag poles and dive loops
// ---------------------------------------------------------------------------
// Gate tiers and flight maneuvers → real flight points
// ---------------------------------------------------------------------------
const MAX_ALT = 15; // same ceiling as the race line editor
const clampZ = (z: number) => Math.max(0.3, Math.min(MAX_ALT, z));
const clampFX = (x: number) => Math.max(0, Math.min(FIELD_WIDTH_M, x));
const clampFY = (y: number) => Math.max(0, Math.min(FIELD_HEIGHT_M, y));

/** Number of stacked openings in a piece. */
function tierCountOf(visualType: string | undefined): number {
  switch (visualType) {
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
/** Height of one opening in metres. */
function tierHeightFor(item: PlacedItem): number {
  const eq = EQUIPMENT_MAP.get(item.equipId);
  if (eq?.resizable && item.sizeH) return item.sizeH; // resized site piece (container, double arch...)
  if (eq?.tierHeight) return eq.tierHeight;
  switch (eq?.visualType) {
    case 'single_gate_blue':
    case 'single_gate_lightblue':
      return 1.5;
    case 'cube_gate':
    case 'double_cube':
      return itemDims(item, eq).w; // a cube is as tall as it is wide
    default:
      return 2;
  }
}
/** Which opening (0 = bottom) a tier setting points at, or null for the default pass. */
function tierIndexOf(t: PlacedItem['targetTier'], count: number): number | null {
  if (t === 'tier1' || t === 1 || t === 'cube1_exit') return 0;
  if (t === 'tier2' || t === 2 || t === 'cube2_dive') return Math.min(1, count - 1);
  if (t === 'tier3' || t === 3) return Math.min(2, count - 1);
  if (t === 'tier4' || t === 4) return Math.min(3, count - 1);
  return null;
}

/**
 * The flight points through one gate, in flying order, honouring its target tier and its entry /
 * exit maneuver. `reverse` builds them for a line that crosses the gate the other way.
 */
export function gateManeuverPoints(item: PlacedItem, reverse = false): TrackPoint[] {
  const eq = EQUIPMENT_MAP.get(item.equipId);
  const rad = ((item.rotation + (reverse ? 180 : 0)) * Math.PI) / 180;
  const fx = -Math.sin(rad);
  const fy = Math.cos(rad);
  const rx = -fy; // the pilot's right
  const ry = fx;
  const elev = item.elevation ?? 0; // raised items: every height is measured from the item's base
  const P = (along: number, side: number, z: number): TrackPoint => ({
    x: Number(clampFX(item.x + fx * along + rx * side).toFixed(2)),
    y: Number(clampFY(item.y + fy * along + ry * side).toFixed(2)),
    z: Number(clampZ(z + elev).toFixed(2)),
  });

  const tiers = tierCountOf(eq?.visualType);
  const th = tierHeightFor(item);
  const top = th * tiers;
  const tierZ = (i: number) => th * (i + 0.5);
  const tierIdx = tierIndexOf(item.targetTier, tiers);
  const z =
    tierIdx !== null
      ? tierZ(tierIdx)
      : eq?.visualType === 'round_gate'
        ? th / 2 // through the middle of the hoop
        : eq?.visualType === 'container'
          ? th / 2
          : Math.min(1.2, top - 0.3);
  const pitchRad = (((item.pitch ?? 0) * (reverse ? -1 : 1)) * Math.PI) / 180;
  const dz = Math.sin(pitchRad) * 0.8;
  const m = item.maneuver ?? 'straight';

  // Ladders: several passes through the stacked openings, turning round between them
  const ladderTier = item.targetTier === 'ladder_up' || item.targetTier === 'ladder_down';
  const ladderMan = m.startsWith('ladder_');
  if ((ladderTier || ladderMan) && tiers > 1) {
    const up = ladderMan ? m.startsWith('ladder_up') : item.targetTier === 'ladder_up';
    const side = m.endsWith('_left') ? -1.6 : 1.6;
    const order = Array.from({ length: tiers }, (_, i) => (up ? i : tiers - 1 - i));
    const out: TrackPoint[] = [];
    order.forEach((ti, j) => {
      const d = j % 2 === 0 ? 1 : -1; // alternate direction each pass
      const zz = tierZ(ti);
      out.push(P(-0.9 * d, 0, zz), P(0, 0, zz), P(0.9 * d, 0, zz));
      if (j < order.length - 1) out.push(P(3.2 * d, side * (j % 2 === 0 ? 1 : -1), (zz + tierZ(order[j + 1])) / 2));
    });
    return out;
  }

  // Double cube default: dive in through the top, out through the bottom
  if (eq?.visualType === 'double_cube' && tierIdx === null && m === 'straight') {
    return [P(-1.8, 0, top + 0.8), P(0, 0, top), P(0.2, 0, th), P(1.5, 0, 0.8)];
  }
  if (eq?.visualType === 'double_cube' && item.targetTier === 'cube2_dive' && m === 'straight') {
    return [P(-2.2, 0, top + 1.2), P(-0.6, 0, top + 0.2), P(0, 0, tierZ(1)), P(1.5, 0, tierZ(1))];
  }

  // Take-off: lift off the pad and climb away forwards
  if (eq?.visualType === 'launch_pad') return [P(0, 0, 0.3), P(1.2, 0, 0.8), P(3, 0, 1.4)];
  // A container is 6 m long: line up well before the opening and stay straight until clear of it
  const reach = eq?.visualType === 'container' ? itemDims(item, eq).d / 2 + 1.2 : 0.8;
  if (eq?.visualType === 'container') {
    return [P(-reach - 1, 0, z), P(-reach, 0, z), P(0, 0, z), P(reach, 0, z), P(reach + 1, 0, z)];
  }
  const pass = [P(-reach, 0, z - dz), P(0, 0, z), P(reach, 0, z + dz)];
  // Sizes are real flying scale for a racing quad (turns of several metres), with enough points that
  // the line smoothing afterwards keeps each shape instead of rounding it away.
  switch (m) {
    case 'enter_corkscrew_right':
    case 'corkscrew_left': {
      // Corkscrew: a full barrel-roll spiral round the flight line, tightening into the centre of the gate.
      // Right = clockwise as the pilot sees it from behind.
      const dir = m === 'corkscrew_left' ? -1 : 1;
      const L = 14;
      const R = 2.5;
      const n = 24;
      const helix: TrackPoint[] = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const a = t * Math.PI * 2;
        const r = R * Math.sin(Math.PI * t); // opens up, then closes onto the gate's centre
        helix.push(P(-L + t * L, dir * r * Math.sin(a), z + r * (1 - Math.cos(a)) * 0.9));
      }
      return [P(-L - 3, 0, z), ...helix, P(1.2, 0, z + dz), P(3, 0, z + dz)];
    }
    case 'slalom_left':
    case 'slalom_right': {
      // S-weave: come in from one side, through the gate, out to the other side
      const s = m === 'slalom_left' ? -1 : 1; // side the line weaves out to after the gate
      const A = 4;
      const pts: TrackPoint[] = [];
      for (let k = 0; k <= 16; k++) {
        const along = -8 + k; // -8 .. +8
        pts.push(P(along, s * A * Math.sin((along / 16) * Math.PI), z));
      }
      return pts;
    }
    case 'dive_in': {
      // Steep dive from about 4 m above the gate into its centre
      const up = Math.max(4, top + 2.5 - z);
      return [P(-9, 0, z + up), P(-6, 0, z + up * 0.95), P(-4, 0, z + up * 0.7), P(-2.2, 0, z + up * 0.3), P(-1, 0, z + 0.08), P(0, 0, z), P(1.5, 0, z)];
    }
    case 'dive_out': {
      // Through the gate, then a steep climb away
      const up = Math.max(4, top + 2.5 - z);
      return [P(-1.5, 0, z), P(0, 0, z), P(1, 0, z + 0.08), P(2.2, 0, z + up * 0.3), P(4, 0, z + up * 0.7), P(6, 0, z + up * 0.95), P(9, 0, z + up)];
    }
    case 'orbit_pole_left_exit':
    case 'orbit_pole_right_exit': {
      // A full turn round a pole standing beside the approach (left or right), then out through the gate.
      // The circle starts and ends on the flight line, heading forward.
      const s = m === 'orbit_pole_left_exit' ? -1 : 1;
      const R = 3.5;
      const cAlong = -7;
      const ring: TrackPoint[] = [];
      const n = 24;
      for (let k = 0; k <= n; k++) {
        const ph = (k / n) * Math.PI * 2;
        ring.push(P(cAlong + R * Math.sin(ph), s * (R - R * Math.cos(ph)), z));
      }
      return [P(-13, 0, z), ...ring, P(-3, 0, z), P(0, 0, z), P(1.5, 0, z)];
    }
    case 'split_s': {
      // Over the top of the gate, a half loop down behind it, then back through the gate the other way
      const R = 3;
      const H = z + 2 * R; // top of the half loop
      const c = 4; // loop centre, metres past the gate
      const loop: TrackPoint[] = [];
      for (let k = 0; k <= 12; k++) {
        const ph = (k / 12) * Math.PI;
        loop.push(P(c + R * Math.sin(ph), 0, z + R + R * Math.cos(ph)));
      }
      return [P(-8, 0, Math.max(H, top + 1.2)), P(-3, 0, Math.max(H, top + 1.2)), P(0, 0, Math.max(H, top + 1.2)), ...loop, P(1.5, 0, z), P(0, 0, z), P(-1.5, 0, z), P(-6, 0, z)];
    }
    case 'reverse_split_s': {
      // Through the gate, a half loop up behind it, then back over the top the other way
      const R = 3;
      const H = z + 2 * R;
      const c = 4;
      const loop: TrackPoint[] = [];
      for (let k = 0; k <= 12; k++) {
        const ph = (k / 12) * Math.PI;
        loop.push(P(c + R * Math.sin(ph), 0, z + R - R * Math.cos(ph)));
      }
      return [P(-6, 0, z), P(-1.5, 0, z), P(0, 0, z), P(1.5, 0, z), ...loop, P(0, 0, Math.max(H, top + 1.2)), P(-3, 0, Math.max(H, top + 1.2)), P(-8, 0, Math.max(H, top + 1.2))];
    }
    case 'ladder_up_left':
    case 'ladder_up_right':
    case 'ladder_down_left':
    case 'ladder_down_right': {
      // Single opening: climb out (up) or drop in (down), turning to the chosen side
      const s = m.endsWith('_left') ? -1 : 1;
      // Climbing (or diving) turn: 4 m of height over a quarter turn of about 5 m radius
      const turn = (k: number) => {
        const t = k / 8;
        const a = t * (Math.PI / 2);
        return { along: 5 * Math.sin(a), side: s * 5 * (1 - Math.cos(a)), dz: 4 * t };
      };
      if (m.startsWith('ladder_up')) {
        const out = [P(-1.5, 0, z), P(0, 0, z)];
        for (let k = 1; k <= 8; k++) {
          const q = turn(k);
          out.push(P(0.8 + q.along, q.side, z + q.dz));
        }
        return out;
      }
      const out: TrackPoint[] = [];
      for (let k = 8; k >= 1; k--) {
        const q = turn(k);
        out.push(P(-0.8 - q.along, -q.side, z + q.dz));
      }
      return [...out, P(0, 0, z), P(1.5, 0, z)];
    }
    default:
      return pass;
  }
}

export function generateCurvedPathFromGates(
  items: PlacedItem[],
  closeLoop: boolean
): TrackPoint[] {
  const ordered = items
    .filter((item) => item.sequenceOrder !== null && item.sequenceOrder > 0)
    .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));

  if (ordered.length < 2) return [];

  const rawKeyPoints: TrackPoint[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    const next = ordered[(i + 1) % ordered.length];
    const prev = ordered[(i - 1 + ordered.length) % ordered.length];
    const equip = EQUIPMENT_MAP.get(current.equipId);

    // If it's a flag pole, create a nice orbiting arc around it!
    if (equip?.visualType === 'flag_pole' && (i < ordered.length - 1 || closeLoop)) {
      // Approach vector from prev
      const approachAngle = Math.atan2(current.y - prev.y, current.x - prev.x);
      // Departure vector to next
      const departAngle = Math.atan2(next.y - current.y, next.x - current.x);

      // Arc radius 1.8m around pole
      const orbitR = 1.8;
      const midAngle = (approachAngle + departAngle) / 2 + Math.PI / 2;

      rawKeyPoints.push({
        x: current.x + Math.cos(approachAngle - Math.PI / 2) * orbitR,
        y: current.y + Math.sin(approachAngle - Math.PI / 2) * orbitR,
        z: 1.5 + (current.elevation ?? 0),
      });
      rawKeyPoints.push({
        x: current.x + Math.cos(midAngle) * orbitR,
        y: current.y + Math.sin(midAngle) * orbitR,
        z: 1.5 + (current.elevation ?? 0),
      });
      rawKeyPoints.push({
        x: current.x + Math.cos(departAngle + Math.PI / 2) * orbitR,
        y: current.y + Math.sin(departAngle + Math.PI / 2) * orbitR,
        z: 1.5 + (current.elevation ?? 0),
      });
    } else {
      // Gates: entry, pass and exit through the target tier, shaped by the chosen maneuver
      rawKeyPoints.push(...gateManeuverPoints(current));
    }
  }

  if (closeLoop && rawKeyPoints.length > 2) {
    rawKeyPoints.push({ ...rawKeyPoints[0] });
  }

  // Smooth out raw points into a high-res racing flight line
  return smoothPathPoints(rawKeyPoints, 3);
}

export function calculatePathAndMetrics(
  items: PlacedItem[],
  closeLoop: boolean,
  droneSpeedKmH: number
): { segments: PathSegment[]; metrics: TrackMetrics } {
  // Filter items with a sequence order, sorted ascending
  const orderedItems = items
    .filter((item) => item.sequenceOrder !== null && item.sequenceOrder > 0)
    .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));

  const segments: PathSegment[] = [];
  let totalDistance = 0;
  let longestStraight = 0;
  let shortestSegment = Infinity;

  if (orderedItems.length >= 2) {
    for (let i = 0; i < orderedItems.length - 1; i++) {
      const from = orderedItems[i];
      const to = orderedItems[i + 1];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      segments.push({
        fromId: from.id,
        toId: to.id,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        distance: dist,
        order: i + 1,
      });

      totalDistance += dist;
      if (dist > longestStraight) longestStraight = dist;
      if (dist < shortestSegment) shortestSegment = dist;
    }

    // Optional loop back from last waypoint to start
    if (closeLoop && orderedItems.length >= 3) {
      const last = orderedItems[orderedItems.length - 1];
      const start = orderedItems[0];
      const dx = start.x - last.x;
      const dy = start.y - last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      segments.push({
        fromId: last.id,
        toId: start.id,
        fromX: last.x,
        fromY: last.y,
        toX: start.x,
        toY: start.y,
        distance: dist,
        order: orderedItems.length,
      });

      totalDistance += dist;
      if (dist > longestStraight) longestStraight = dist;
      if (dist < shortestSegment) shortestSegment = dist;
    }
  }

  const averageSegment =
    segments.length > 0 ? totalDistance / segments.length : 0;

  // Drone speed in m/s: km/h / 3.6
  const speedMetersPerSecond = Math.max(1, (droneSpeedKmH * 1000) / 3600);
  const estimatedLapTime = totalDistance / speedMetersPerSecond;

  const metrics: TrackMetrics = {
    totalDistance,
    gateCount: orderedItems.length,
    longestStraight: segments.length > 0 ? longestStraight : 0,
    shortestSegment: segments.length > 0 ? (shortestSegment === Infinity ? 0 : shortestSegment) : 0,
    averageSegment,
    estimatedLapTime,
  };

  return { segments, metrics };
}

export function hitTestItem(
  worldX: number,
  worldY: number,
  item: PlacedItem
): boolean {
  const equip = EQUIPMENT_MAP.get(item.equipId);
  if (!equip) return false;

  // Translate to item center
  const dx = worldX - item.x;
  const dy = worldY - item.y;

  // Unrotate
  const rad = (-item.rotation * Math.PI) / 180;
  let localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

  if (item.isMirrored) {
    localX = -localX;
  }

  const dims = itemDims(item, equip);
  if (equip.visualType === 'dirt_curve') {
    // Quarter ring round the item's origin (local +x to local -y)
    const r = Math.hypot(localX, localY);
    return localX >= -0.5 && localY <= 0.5 && Math.abs(r - dims.d) <= dims.w / 2;
  }
  const halfW = Math.max(dims.w / 2, 0.6);
  const halfD = Math.max(dims.d / 2, 0.6);

  if (equip.visualType === 'vertical_quad') {
    return (
      localX >= -halfW - 0.4 &&
      localX <= halfW + 1.8 &&
      localY >= -6.4 &&
      localY <= halfD + 0.5
    );
  }
  if (equip.visualType === 'vertical_triple') {
    return (
      localX >= -halfW - 0.4 &&
      localX <= halfW + 1.6 &&
      localY >= -4.8 &&
      localY <= halfD + 0.5
    );
  }
  if (equip.visualType === 'vertical_double' || equip.visualType === 'double_cube') {
    return (
      localX >= -halfW - 0.4 &&
      localX <= halfW + 1.2 &&
      localY >= -3.2 &&
      localY <= halfD + 0.5
    );
  }

  return (
    localX >= -halfW - 0.3 &&
    localX <= halfW + 0.3 &&
    localY >= -halfD - 0.3 &&
    localY <= halfD + 0.3
  );
}

export function hitTestRotationHandle(
  worldX: number,
  worldY: number,
  item: PlacedItem
): boolean {
  const equip = EQUIPMENT_MAP.get(item.equipId);
  if (!equip) return false;

  const dx = worldX - item.x;
  const dy = worldY - item.y;

  const rad = (-item.rotation * Math.PI) / 180;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

  const maxDim = Math.max(equip.width, equip.depth);
  const ringRadius = maxDim / 2 + 0.65;
  const handleStemLen = ringRadius + 1.1;

  // Knob center is at (0, -handleStemLen) with radius 0.6m
  const distToKnob = Math.sqrt(
    localX * localX + (localY - -handleStemLen) * (localY - -handleStemLen)
  );

  return distToKnob <= 0.95;
}

export function snapCoord(val: number, snapGrid: number, maxLimit: number): number {
  if (snapGrid <= 0) return Math.min(Math.max(0.5, val), maxLimit - 0.5);
  const snapped = Math.round(val / snapGrid) * snapGrid;
  return Math.min(Math.max(0.5, snapped), maxLimit - 0.5);
}

export function isInsideFence(x: number, y: number): boolean {
  return (
    x >= PERIMETER_FENCE_M &&
    x <= FIELD_WIDTH_M - PERIMETER_FENCE_M &&
    y >= PERIMETER_FENCE_M &&
    y <= FIELD_HEIGHT_M - PERIMETER_FENCE_M
  );
}

export interface ManeuverBadgeLayout {
  x: number; // center X in world meters
  y: number; // center Y in world meters
  width: number; // badge width in meters
  height: number; // badge height in meters
  rotation: number; // rotation in degrees (0 - 360)
  text: string;
  icon: string;
  gateEdgeX: number; // connection anchor on gate
  gateEdgeY: number; // connection anchor on gate
}

export function getManeuverBadgeLayout(item: PlacedItem): ManeuverBadgeLayout | null {
  if (!item.maneuver || item.maneuver === 'straight') return null;
  const mOpt = MANEUVER_OPTIONS.find((m) => m.id === item.maneuver);
  if (!mOpt) return null;

  const equip = EQUIPMENT_MAP.get(item.equipId);
  const equipW = equip?.width ?? 2.0;

  const text = `${mOpt.iconSymbol} ${mOpt.shortLabel}`;
  // Estimate text width in meters (font size ~0.46m)
  const width = Math.max(2.0, text.length * 0.28 + 0.9);
  const height = 0.72;

  let badgeX: number;
  let badgeY: number;

  if (item.maneuverOffsetX !== undefined && item.maneuverOffsetY !== undefined) {
    badgeX = item.x + item.maneuverOffsetX;
    badgeY = item.y + item.maneuverOffsetY;
  } else {
    // Default position: offset to the side of the gate based on orientation
    const rad = (item.rotation * Math.PI) / 180;
    const localDist = equipW / 2 + width / 2 + 0.4;
    badgeX = item.x + Math.cos(rad) * localDist;
    badgeY = item.y + Math.sin(rad) * localDist;
  }

  // Anchor point on the gate perimeter pointing toward badge
  const angleToBadge = Math.atan2(badgeY - item.y, badgeX - item.x);
  const gateAnchorRadius = Math.min(equipW / 2, 1.2);
  const gateEdgeX = item.x + Math.cos(angleToBadge) * gateAnchorRadius;
  const gateEdgeY = item.y + Math.sin(angleToBadge) * gateAnchorRadius;

  return {
    x: badgeX,
    y: badgeY,
    width,
    height,
    rotation: item.maneuverRotation ?? 0,
    text,
    icon: mOpt.iconSymbol,
    gateEdgeX,
    gateEdgeY,
  };
}

export function hitTestManeuverBadge(
  worldX: number,
  worldY: number,
  item: PlacedItem
): boolean {
  const layout = getManeuverBadgeLayout(item);
  if (!layout) return false;

  const dx = worldX - layout.x;
  const dy = worldY - layout.y;

  const rad = (-layout.rotation * Math.PI) / 180;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

  const halfW = layout.width / 2 + 0.35; // generous hit zone for responsive dragging
  const halfH = layout.height / 2 + 0.35;

  return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
}

export function hitTestManeuverRotateHandle(
  worldX: number,
  worldY: number,
  item: PlacedItem
): boolean {
  const layout = getManeuverBadgeLayout(item);
  if (!layout) return false;

  const dx = worldX - layout.x;
  const dy = worldY - layout.y;

  const rad = (-layout.rotation * Math.PI) / 180;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

  const stemTop = -layout.height / 2 - 0.65;
  const dist = Math.sqrt(localX * localX + (localY - stemTop) * (localY - stemTop));

  return dist <= 0.55; // generous hit zone for the rotation knob
}

