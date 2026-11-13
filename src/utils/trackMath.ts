import { MANEUVER_OPTIONS, PathSegment, PlacedItem, TrackMetrics, TrackPoint } from '../types';
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
        z: 1.5,
      });
      rawKeyPoints.push({
        x: current.x + Math.cos(midAngle) * orbitR,
        y: current.y + Math.sin(midAngle) * orbitR,
        z: 1.5,
      });
      rawKeyPoints.push({
        x: current.x + Math.cos(departAngle + Math.PI / 2) * orbitR,
        y: current.y + Math.sin(departAngle + Math.PI / 2) * orbitR,
        z: 1.5,
      });
    } else if (equip?.visualType === 'double_cube') {
      // 4m Vertical Double Cube Gate: Power loop / vertical dive!
      // Drones approach at high altitude (4.5m), dive down into top ring (4m), plunge to 1m, exit forward
      const rad = (current.rotation * Math.PI) / 180;
      const forwardX = -Math.sin(rad);
      const forwardY = Math.cos(rad);

      // Approach high above gate entry
      rawKeyPoints.push({
        x: current.x - forwardX * 1.8,
        y: current.y - forwardY * 1.8,
        z: 4.8,
      });
      // Center of top dive portal (at 4.0m elevation)
      rawKeyPoints.push({
        x: current.x,
        y: current.y,
        z: 4.0,
      });
      // Mid dive inside the vertical shaft
      rawKeyPoints.push({
        x: current.x + forwardX * 0.2,
        y: current.y + forwardY * 0.2,
        z: 2.0,
      });
      // Pull out through bottom ground exit archway
      rawKeyPoints.push({
        x: current.x + forwardX * 1.5,
        y: current.y + forwardY * 1.5,
        z: 0.8,
      });
    } else {
      // Gate entry and exit points aligned with yaw and pitch angles
      const rad = (current.rotation * Math.PI) / 180;
      const forwardX = -Math.sin(rad);
      const forwardY = Math.cos(rad);

      // Pitch tilts the gate trajectory up or down in Z (altitude)
      const pitchDeg = current.pitch ?? 0;
      const pitchRad = (pitchDeg * Math.PI) / 180;
      const dz = Math.sin(pitchRad) * 0.8;
      const baseZ = 1.2;

      // Add point slightly before and after gate center for clean forward entry/exit matching pitch slope
      rawKeyPoints.push({
        x: current.x - forwardX * 0.8,
        y: current.y - forwardY * 0.8,
        z: Math.max(0.3, Math.min(5.0, baseZ - dz)),
      });
      rawKeyPoints.push({
        x: current.x,
        y: current.y,
        z: baseZ,
      });
      rawKeyPoints.push({
        x: current.x + forwardX * 0.8,
        y: current.y + forwardY * 0.8,
        z: Math.max(0.3, Math.min(5.0, baseZ + dz)),
      });
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

  const halfW = Math.max(equip.width / 2, 0.6);
  const halfD = Math.max(equip.depth / 2, 0.6);

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

