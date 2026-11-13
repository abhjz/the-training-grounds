import { EquipmentDef, PathSegment, PlacedItem, TrackPoint, MANEUVER_OPTIONS } from '../types';
import {
  ACTIVE_GROUND_NAME,
  EQUIPMENT_MAP,
  FIELD_HEIGHT_M,
  FIELD_WIDTH_M,
  PERIMETER_FENCE_M,
} from '../constants/equipment';
import { drawWatermarkText } from './watermark';
import { getManeuverBadgeLayout } from './trackMath';

export interface ViewportTransform {
  scale: number; // pixels per meter
  offsetX: number; // screen pixels
  offsetY: number; // screen pixels
}

export interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  viewport: ViewportTransform;
  items: PlacedItem[];
  selectedItemId: string | null;
  hoveredItemId: string | null;
  isRotating: boolean;
  closeLoop: boolean;
  pathSegments: PathSegment[];
  drawnPath?: TrackPoint[];
  isDrawing?: boolean;
  isDrawMode?: boolean;
  activeStroke?: TrackPoint[];
  cursorWorld?: TrackPoint | null;
  showGridNumbers?: boolean;
  showDistances?: boolean;
  drawnPathColor?: string;
  draggingManeuverItemId?: string | null;
  hoveredManeuverItemId?: string | null;
  rotatingManeuverItemId?: string | null;
  hoveredManeuverRotateHandleId?: string | null;
  isRotatingGate?: boolean;
  hoveredGateRotateHandleId?: string | null;
  placingEquipId?: string | null;
  placementYaw?: number;
}

export function drawFieldScene(options: RenderOptions) {
  const {
    ctx,
    canvasWidth,
    canvasHeight,
    viewport,
    items,
    selectedItemId,
    hoveredItemId,
    closeLoop = false,
    pathSegments,
    drawnPath = [],
    isDrawing = false,
    isDrawMode = false,
    activeStroke = [],
    cursorWorld = null,
    showDistances = true,
    drawnPathColor = '#ef4444',
    draggingManeuverItemId = null,
    hoveredManeuverItemId = null,
    rotatingManeuverItemId = null,
    hoveredManeuverRotateHandleId = null,
    isRotatingGate = false,
    hoveredGateRotateHandleId = null,
    placingEquipId = null,
    placementYaw = 0,
  } = options;

  const { scale, offsetX, offsetY } = viewport;

  // Clear background
  ctx.save();
  ctx.fillStyle = '#080c14'; // deep dark navy background outside field
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Set world coordinate transform: screen = offset + world * scale
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // 1. Draw Field Boundary (57m x 43m)
  const fieldW = FIELD_WIDTH_M;
  const fieldH = FIELD_HEIGHT_M;

  // Field Grass / Turf Surface (Dark modern high-tech field surface)
  ctx.fillStyle = '#0f172a'; // slate-900 turf
  ctx.fillRect(0, 0, fieldW, fieldH);

  // Field border outer
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 0.15;
  ctx.strokeRect(0, 0, fieldW, fieldH);

  // 2. Draw 1-Meter Grid Lines
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.25)'; // faint 1m lines

  // Vertical 1m lines
  for (let x = 1; x < fieldW; x++) {
    if (x % 5 !== 0) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, fieldH);
      ctx.stroke();
    }
  }

  // Horizontal 1m lines
  for (let y = 1; y < fieldH; y++) {
    if (y % 5 !== 0) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(fieldW, y);
      ctx.stroke();
    }
  }

  // Major 5m Grid Lines
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
  for (let x = 5; x < fieldW; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, fieldH);
    ctx.stroke();
  }
  for (let y = 5; y < fieldH; y += 5) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(fieldW, y);
    ctx.stroke();
  }

  // Field Center Markings
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(fieldW / 2, fieldH / 2, 2.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fieldW / 2 - 1.5, fieldH / 2);
  ctx.lineTo(fieldW / 2 + 1.5, fieldH / 2);
  ctx.moveTo(fieldW / 2, fieldH / 2 - 1.5);
  ctx.lineTo(fieldW / 2, fieldH / 2 + 1.5);
  ctx.stroke();

  // Ground name watermark, printed faintly across the blueprint (also appears in PNG exports)
  drawWatermarkText(ctx, ACTIVE_GROUND_NAME, fieldW, fieldH, 'rgba(148, 163, 184, 0.09)');

  // 3. Clear Boundary: 3m Perimeter Fence
  // 3m inset safety buffer zone
  const fenceInset = PERIMETER_FENCE_M;
  const innerW = fieldW - fenceInset * 2;
  const innerH = fieldH - fenceInset * 2;

  // Hatch / safety zone between outer edge and 3m perimeter fence
  ctx.fillStyle = 'rgba(239, 68, 68, 0.035)'; // subtle red/amber warning tint for buffer zone
  // Top buffer
  ctx.fillRect(0, 0, fieldW, fenceInset);
  // Bottom buffer
  ctx.fillRect(0, fieldH - fenceInset, fieldW, fenceInset);
  // Left buffer
  ctx.fillRect(0, fenceInset, fenceInset, innerH);
  // Right buffer
  ctx.fillRect(fieldW - fenceInset, fenceInset, fenceInset, innerH);

  // Draw 3m Perimeter Fence Line (Dashed high-visibility fence line)
  ctx.save();
  ctx.setLineDash([0.6, 0.4]);
  ctx.lineWidth = 0.12;
  ctx.strokeStyle = '#f59e0b'; // amber perimeter fence
  ctx.strokeRect(fenceInset, fenceInset, innerW, innerH);
  ctx.restore();

  // Perimeter Fence Corner Markers and Labels
  drawPerimeterFenceLabels(ctx, fieldW, fieldH, fenceInset);

  // 4. Draw Flight Path Line connecting ordered gates or user-drawn track
  if (drawnPath && drawnPath.length >= 2) {
    if (isDrawing && pathSegments.length > 0) {
      drawFlightPath(ctx, pathSegments, true, showDistances); // subtle faint guide while drawing
    }
    drawCustomDrawnFlightPath(ctx, drawnPath, closeLoop, isDrawing, isDrawMode, items, drawnPathColor, showDistances);
  } else if (pathSegments.length > 0) {
    drawFlightPath(ctx, pathSegments, false, showDistances);
  }

  // Draw active stroke if user is drawing right now
  if (isDrawing && activeStroke && activeStroke.length > 0) {
    drawActiveDrawingStroke(ctx, activeStroke, cursorWorld, drawnPathColor);
  }

  // 5. Draw Placed Equipment Items
  items.forEach((item) => {
    const isSelected = item.id === selectedItemId;
    const isHovered = item.id === hoveredItemId;
    drawPlacedItem(ctx, item, isSelected, isHovered, drawnPath);
  });

  // 6. Draw Rotation Handle and Selection Ring for selected item
  if (selectedItemId) {
    const selectedItem = items.find((i) => i.id === selectedItemId);
    if (selectedItem) {
      const isHoveredKnob = hoveredGateRotateHandleId === selectedItemId;
      drawSelectionGizmo(ctx, selectedItem, isHoveredKnob, isRotatingGate);
    }
  }

  // 6.5 Draw Ghost of Placing Equipment with live yaw orientation
  if (placingEquipId && cursorWorld) {
    drawPlacingGhost(ctx, placingEquipId, placementYaw, cursorWorld);
  }

  // 7. Draw Flight Maneuver Badges in world space (free vertical & horizontal drag placement & rotation)
  items.forEach((item) => {
    if (item.maneuver && item.maneuver !== 'straight') {
      const isSelected = item.id === selectedItemId;
      const isDragging = item.id === draggingManeuverItemId;
      const isHovered = item.id === hoveredManeuverItemId;
      const isRotating = item.id === rotatingManeuverItemId;
      const isHoveredRotateHandle = item.id === hoveredManeuverRotateHandleId;
      drawFlightManeuverBadge(
        ctx,
        item,
        isSelected,
        isDragging,
        isHovered,
        isRotating,
        isHoveredRotateHandle
      );
    }
  });

  // Restore world transform before drawing screen-space HUD markings if needed
  ctx.restore();

  // 8. Draw Screen-Space Grid Ruler Labels (Meters along top and left)
  drawRulerLabels(ctx, viewport, fieldW, fieldH);
}

function drawPerimeterFenceLabels(
  ctx: CanvasRenderingContext2D,
  fieldW: number,
  fieldH: number,
  fenceInset: number
) {
  ctx.save();
  ctx.font = 'bold 0.7px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Top fence label
  ctx.fillText('3m PERIMETER FENCE (SAFETY BUFFER)', fieldW / 2, fenceInset - 0.7);

  // Corner warning badges
  const corners = [
    { x: fenceInset + 1.2, y: fenceInset + 0.8 },
    { x: fieldW - fenceInset - 1.2, y: fenceInset + 0.8 },
    { x: fenceInset + 1.2, y: fieldH - fenceInset - 0.8 },
    { x: fieldW - fenceInset - 1.2, y: fieldH - fenceInset - 0.8 },
  ];
  ctx.font = '0.55px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(245, 158, 11, 0.6)';
  corners.forEach((c) => {
    ctx.fillText('3m FENCE', c.x, c.y);
  });

  // Outer field dimensions text
  ctx.font = 'bold 0.85px "JetBrains Mono", monospace';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`${fieldW.toFixed(1)} METERS WIDTH`, fieldW / 2, fieldH - 0.9);

  ctx.save();
  ctx.translate(0.9, fieldH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${fieldH.toFixed(1)} METERS HEIGHT`, 0, 0);
  ctx.restore();

  ctx.restore();
}

function drawFlightPath(
  ctx: CanvasRenderingContext2D,
  pathSegments: PathSegment[],
  faint: boolean = false,
  showDistances: boolean = true
) {
  if (pathSegments.length === 0) return;

  ctx.save();

  // 1. Draw glowing path line
  pathSegments.forEach((seg) => {
    // Outer glow
    ctx.beginPath();
    ctx.moveTo(seg.fromX, seg.fromY);
    ctx.lineTo(seg.toX, seg.toY);
    ctx.strokeStyle = faint ? 'rgba(6, 182, 212, 0.08)' : 'rgba(6, 182, 212, 0.25)';
    ctx.lineWidth = 0.35;
    ctx.stroke();

    // Inner dashed line
    ctx.save();
    ctx.setLineDash([0.8, 0.5]);
    ctx.strokeStyle = faint ? 'rgba(34, 211, 238, 0.35)' : '#22d3ee';
    ctx.lineWidth = faint ? 0.08 : 0.14;
    ctx.stroke();
    ctx.restore();

    if (faint) return; // Skip distance badges and heavy chevrons in faint mode

    // Directional chevron / arrow at 60% along segment (Red color arrow)
    const dx = seg.toX - seg.fromX;
    const dy = seg.toY - seg.fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1.2) {
      const angle = Math.atan2(dy, dx);
      const arrowDist = 0.65; // position along line
      const arrowX = seg.fromX + dx * arrowDist;
      const arrowY = seg.fromY + dy * arrowDist;

      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(angle);

      // Arrow in Red color
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(0.5, 0);
      ctx.lineTo(-0.35, -0.28);
      ctx.lineTo(-0.15, 0);
      ctx.lineTo(-0.35, 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // Segment Distance Badge (pill in center of segment)
    if (showDistances && seg.distance > 0.5) {
      const midX = (seg.fromX + seg.toX) / 2;
      const midY = (seg.fromY + seg.toY) / 2;

      // Small pill badge
      const text = `${seg.distance.toFixed(1)}m`;
      ctx.font = 'bold 0.65px "JetBrains Mono", monospace';
      const textMetrics = ctx.measureText(text);
      const badgeW = textMetrics.width + 0.6;
      const badgeH = 0.9;

      ctx.save();
      ctx.translate(midX, midY);

      // Badge background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.lineWidth = 0.05;

      ctx.beginPath();
      ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 0.25);
      ctx.fill();
      ctx.stroke();

      // Badge text
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0.05);

      ctx.restore();
    }
  });

  ctx.restore();
}

function getPathColorSegments(
  points: TrackPoint[],
  defaultColor: string
): { color: string; startIndex: number; endIndex: number }[] {
  if (points.length < 2) return [];
  const segments: { color: string; startIndex: number; endIndex: number }[] = [];
  let currentColor = points[1].color || points[0].color || defaultColor;
  let startIdx = 0;

  for (let i = 1; i < points.length; i++) {
    const ptColor = points[i].color || currentColor;
    if (ptColor !== currentColor) {
      segments.push({ color: currentColor, startIndex: startIdx, endIndex: i });
      currentColor = ptColor;
      startIdx = i - 1; // 1-point overlap so consecutive segments touch seamlessly
    }
  }
  segments.push({ color: currentColor, startIndex: startIdx, endIndex: points.length - 1 });
  return segments;
}

function drawCustomDrawnFlightPath(
  ctx: CanvasRenderingContext2D,
  drawnPath: TrackPoint[],
  closeLoop: boolean,
  isDrawing: boolean = false,
  isDrawMode: boolean = false,
  items: PlacedItem[] = [],
  drawnPathColor: string = '#ef4444',
  showDistances: boolean = true
) {
  if (drawnPath.length < 2) return;

  ctx.save();
  const fallbackColor = drawnPathColor || '#ef4444';
  const shouldClose = closeLoop && !isDrawMode && !isDrawing;

  // 1 & 2. Multi-colored Dotted Flight Path
  // Each stroke segment preserves the color it was drawn in!
  const colorSegments = getPathColorSegments(drawnPath, fallbackColor);

  for (const seg of colorSegments) {
    const segColor = seg.color || fallbackColor;

    // Outer Glow Dotted Path
    ctx.save();
    ctx.setLineDash([0.35, 0.25]); // DOTTED LINE
    ctx.beginPath();
    ctx.moveTo(drawnPath[seg.startIndex].x, drawnPath[seg.startIndex].y);
    for (let i = seg.startIndex + 1; i <= seg.endIndex; i++) {
      ctx.lineTo(drawnPath[i].x, drawnPath[i].y);
    }
    ctx.strokeStyle = segColor;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 0.44;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // Crisp Core Dotted Line
    ctx.save();
    ctx.setLineDash([0.35, 0.25]); // DOTTED LINE
    ctx.beginPath();
    ctx.moveTo(drawnPath[seg.startIndex].x, drawnPath[seg.startIndex].y);
    for (let i = seg.startIndex + 1; i <= seg.endIndex; i++) {
      ctx.lineTo(drawnPath[i].x, drawnPath[i].y);
    }
    ctx.strokeStyle = segColor;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 0.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // Closing loop line back to start
  if (shouldClose && drawnPath.length > 2) {
    const lastColor = drawnPath[drawnPath.length - 1].color || fallbackColor;
    ctx.save();
    ctx.setLineDash([0.35, 0.25]);
    ctx.beginPath();
    ctx.moveTo(drawnPath[drawnPath.length - 1].x, drawnPath[drawnPath.length - 1].y);
    ctx.lineTo(drawnPath[0].x, drawnPath[0].y);
    ctx.strokeStyle = lastColor;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 0.2;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // 3. Directional Flight Chevrons along the drawn curve (Red color arrow)
  let accumDist = 0;
  const chevronSpacing = 5.0;
  let nextChevronTarget = chevronSpacing / 2;

  for (let i = 0; i < drawnPath.length - 1; i++) {
    const p1 = drawnPath[i];
    const p2 = drawnPath[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (segLen === 0) continue;

    while (accumDist + segLen >= nextChevronTarget) {
      const remainingToTarget = nextChevronTarget - accumDist;
      const t = remainingToTarget / segLen;
      const arrowX = p1.x + dx * t;
      const arrowY = p1.y + dy * t;
      const angle = Math.atan2(dy, dx);

      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(angle);

      // Red color arrow
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 0.04;
      ctx.shadowColor = '#dc2626';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(0.55, 0);
      ctx.lineTo(-0.35, -0.28);
      ctx.lineTo(-0.15, 0);
      ctx.lineTo(-0.35, 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
      nextChevronTarget += chevronSpacing;
    }

    accumDist += segLen;
  }

  // 4. Start Marker Beacon
  const startP = drawnPath[0];
  ctx.save();
  ctx.translate(startP.x, startP.y);

  // Outer ring
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.arc(0, 0, 0.55, 0, Math.PI * 2);
  ctx.stroke();

  // Center point
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(0, 0, 0.24, 0, Math.PI * 2);
  ctx.fill();

  // "1 START" pill
  const startText = '🏁 1 START';
  ctx.font = 'bold 0.62px "JetBrains Mono", monospace';
  const sWidth = ctx.measureText(startText).width + 0.6;
  ctx.fillStyle = '#065f46';
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.roundRect(-sWidth / 2, -1.35, sWidth, 0.78, 0.22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ecfdf5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(startText, 0, -0.96);
  ctx.restore();

  // 5. Resumable End Point Beacon or Closed Lap Marker
  const endP = drawnPath[drawnPath.length - 1];
  ctx.save();
  ctx.translate(endP.x, endP.y);

  if (shouldClose) {
    // Closed circuit banner
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.arc(0, 0, 0.6, 0, Math.PI * 2);
    ctx.stroke();

    const lapText = '🏁 LAP FINISH';
    ctx.font = 'bold 0.6px "JetBrains Mono", monospace';
    const lWidth = ctx.measureText(lapText).width + 0.6;
    ctx.fillStyle = '#065f46';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.roundRect(-lWidth / 2, 0.9, lWidth, 0.75, 0.2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ecfdf5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lapText, 0, 1.28);
  } else if (!isDrawing) {
    // Resumable End Point Beacon
    ctx.strokeStyle = isDrawMode ? '#38bdf8' : '#f59e0b';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.arc(0, 0, 0.75, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.setLineDash([0.22, 0.15]);
    ctx.strokeStyle = isDrawMode ? '#22d3ee' : '#fbbf24';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(0, 0, 0.48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = isDrawMode ? '#38bdf8' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(0, 0, 0.22, 0, Math.PI * 2);
    ctx.fill();

    const resumeText = isDrawMode
      ? 'LINE PAUSED · HOLD & DRAG TO CONTINUE ➔'
      : 'TRACK END · CLICK DRAW TO CONTINUE';
    ctx.font = 'bold 0.52px "JetBrains Mono", monospace';
    const rWidth = ctx.measureText(resumeText).width + 0.7;
    const rHeight = 0.75;
    const rY = 0.95;

    ctx.fillStyle = isDrawMode ? 'rgba(12, 74, 110, 0.96)' : 'rgba(69, 26, 3, 0.95)';
    ctx.strokeStyle = isDrawMode ? '#38bdf8' : '#f59e0b';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.roundRect(-rWidth / 2, rY, rWidth, rHeight, 0.2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDrawMode ? '#f0f9ff' : '#fffbeb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(resumeText, 0, rY + 0.38);
  }
  ctx.restore();

  ctx.restore();
}

function drawActiveDrawingStroke(
  ctx: CanvasRenderingContext2D,
  activeStroke: TrackPoint[],
  cursorWorld: TrackPoint | null,
  drawnPathColor: string = '#ef4444'
) {
  if (activeStroke.length === 0) return;

  ctx.save();
  const color = drawnPathColor || '#ef4444';

  ctx.setLineDash([0.35, 0.25]); // Dotted stroke while drawing

  ctx.beginPath();
  ctx.moveTo(activeStroke[0].x, activeStroke[0].y);
  for (let i = 1; i < activeStroke.length; i++) {
    ctx.lineTo(activeStroke[i].x, activeStroke[i].y);
  }
  if (cursorWorld) {
    ctx.lineTo(cursorWorld.x, cursorWorld.y);
  }

  // Outer glow
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 0.44;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Core stream
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 0.2;
  ctx.stroke();

  // Pen tip cursor circle & target crosshairs
  if (cursorWorld) {
    ctx.save();
    ctx.translate(cursorWorld.x, cursorWorld.y);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(-0.8, 0);
    ctx.lineTo(0.8, 0);
    ctx.moveTo(0, -0.8);
    ctx.lineTo(0, 0.8);
    ctx.stroke();

    // Active pen dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

function drawPlacedItem(
  ctx: CanvasRenderingContext2D,
  item: PlacedItem,
  isSelected: boolean,
  isHovered: boolean,
  drawnPath: TrackPoint[] = []
) {
  const equip = EQUIPMENT_MAP.get(item.equipId);
  if (!equip) return;

  const pitchDeg = item.pitch ?? 0;
  const rollDeg = item.roll ?? 0;
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const rollRad = (rollDeg * Math.PI) / 180;

  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate((item.rotation * Math.PI) / 180);

  // Apply 3D pitch and roll transformations:
  // Roll tilts/banks the gate sideways around the local forward axis (in-plane tilt)
  if (rollDeg !== 0) {
    ctx.rotate(rollRad);
  }

  // Pitch tilts the gate forward/backward around the local lateral axis:
  // We compress the vertical depth/elevation according to cos(pitch) and apply vertical skew/offset sin(pitch)
  if (pitchDeg !== 0) {
    const scaleY = Math.cos(pitchRad);
    const skewY = Math.sin(pitchRad) * 0.45;
    ctx.transform(1, 0, 0, scaleY, 0, skewY);
  }

  if (item.isMirrored) {
    ctx.scale(-1, 1);
  }

  // Custom pieces reuse the built-in drawings: scale to their width and tint to their colour
  if (equip.isCustom) {
    const k = equip.width / (BASE_DRAW_WIDTH[equip.visualType] ?? equip.width);
    if (Math.abs(k - 1) > 0.01) ctx.scale(k, k);
    const shift = hexHue(equip.color) - (BASE_DRAW_HUE[equip.visualType] ?? 0);
    if (Math.abs(shift) > 2) ctx.filter = `hue-rotate(${Math.round(shift)}deg)`;
  }

  // Render specific visual types based on equipment specs:
  switch (equip.visualType) {
    case 'single_gate_blue':
      drawSingleGateBlue(ctx, equip, isSelected, isHovered);
      break;
    case 'single_gate_lightblue':
      drawSingleGateLightBlue(ctx, equip, isSelected, isHovered);
      break;
    case 'vertical_double':
      drawVerticalDoubleGate(ctx, equip, isSelected, isHovered, item, drawnPath);
      break;
    case 'vertical_triple':
      drawVerticalTripleGate(ctx, equip, isSelected, isHovered, item, drawnPath);
      break;
    case 'vertical_quad':
      drawVerticalQuadGate(ctx, equip, isSelected, isHovered, item, drawnPath);
      break;
    case 'flag_pole':
      drawFlagPole(ctx, equip, isSelected, isHovered);
      break;
    case 'cube_gate':
      drawCubeGate(ctx, equip, isSelected, isHovered);
      break;
    case 'double_cube':
      drawDoubleCubeGate(ctx, equip, isSelected, isHovered, item, drawnPath);
      break;
  }

  // Draw Sequence Number Badge (top-down, unrotated so it's always upright and readable)
  ctx.restore();

  // Draw Sequence, Maneuver, and Mirror labels unrotated for clean reading
  drawItemLabels(ctx, item, equip, isSelected);

  if (item.locked) drawLockBadge(ctx, item.x + 1.4, item.y + 1.2);
}

// Widths the fixed-size drawings were made for (single gates and cubes already follow equip.width)
const BASE_DRAW_WIDTH: Partial<Record<string, number>> = {
  vertical_double: 2,
  vertical_triple: 2,
  vertical_quad: 2,
  flag_pole: 0.9,
  double_cube: 2,
};
// Main hue of each built-in drawing, used to tint custom colours
const BASE_DRAW_HUE: Partial<Record<string, number>> = {
  single_gate_blue: 221,
  single_gate_lightblue: 199,
  vertical_double: 272,
  vertical_triple: 272,
  vertical_quad: 272,
  flag_pole: 21,
  cube_gate: 161,
  double_cube: 161,
};

function hexHue(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Small padlock marking a locked piece (world units = metres). */
function drawLockBadge(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.6, 1.6); // readable at normal zoom
  ctx.fillStyle = 'rgba(9, 13, 22, 0.9)';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(0, 0, 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Shackle
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.arc(0, -0.06, 0.13, Math.PI, 0);
  ctx.stroke();
  // Body
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(-0.19, -0.06, 0.38, 0.27);
  ctx.restore();
}

function drawSingleGateBlue(
  ctx: CanvasRenderingContext2D,
  equip: EquipmentDef,
  isSelected: boolean,
  isHovered: boolean
) {
  const w = equip.width; // 1.5m
  const d = 0.4; // 0.4m depth footprint
  const archH = 1.1; // 3D projection height

  // 1. Cast shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0.12, 0.12, w / 2 + 0.15, d / 2 + 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Base ground plates
  ctx.fillStyle = '#1e3a8a';
  const plateW = 0.32;
  const plateD = 0.28;
  ctx.fillRect(-w / 2, -plateD / 2, plateW, plateD);
  ctx.fillRect(w / 2 - plateW, -plateD / 2, plateW, plateD);

  // Ground baseline
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + plateW / 2, 0);
  ctx.lineTo(w / 2 - plateW / 2, 0);
  ctx.stroke();

  // 3. 3D Rising Tubular Arch
  // Left upright
  ctx.strokeStyle = isSelected ? '#93c5fd' : isHovered ? '#60a5fa' : '#2563eb';
  ctx.lineWidth = 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 0.16, 0);
  ctx.lineTo(-w / 2 + 0.16, -archH);
  // Curved top arch
  ctx.bezierCurveTo(
    -w / 2 + 0.16,
    -archH - 0.45,
    w / 2 - 0.16,
    -archH - 0.45,
    w / 2 - 0.16,
    -archH
  );
  // Right upright
  ctx.lineTo(w / 2 - 0.16, 0);
  ctx.stroke();

  // 4. Glowing Neon LED Inner Strip
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 0.16, 0);
  ctx.lineTo(-w / 2 + 0.16, -archH);
  ctx.bezierCurveTo(
    -w / 2 + 0.16,
    -archH - 0.45,
    w / 2 - 0.16,
    -archH - 0.45,
    w / 2 - 0.16,
    -archH
  );
  ctx.lineTo(w / 2 - 0.16, 0);
  ctx.stroke();

  // 5. Directional Forward Entry Arrow
  drawForwardArrow(ctx, 0, -archH - 0.6, '#60a5fa');
}

function drawSingleGateLightBlue(
  ctx: CanvasRenderingContext2D,
  equip: EquipmentDef,
  isSelected: boolean,
  isHovered: boolean
) {
  // Ground footprint width: 1.5m (-0.75m to +0.75m)
  // Left upright: 1.5m tall
  // Arch opening: 1.5m wide × 1.5m high
  // Right upright: 1.5m base post + 1m extension pole on top = 2.5m total height on this side
  const w = equip.width; // 1.5m
  const d = equip.depth || 0.4;
  const archH = 1.05;
  const archApexY = -1.5;
  const leftX = -w / 2 + 0.16;
  const rightX = w / 2 - 0.16;
  const poleTopY = -2.5;

  // 1. Cast shadows
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  // Base gate footprint shadow
  ctx.beginPath();
  ctx.ellipse(0.1, 0.1, w / 2 + 0.15, d / 2 + 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Elongated shadow cast from the 2.5m tall right pole
  ctx.beginPath();
  ctx.moveTo(rightX - 0.15, 0.1);
  ctx.lineTo(rightX + 0.9, -1.4);
  ctx.lineTo(rightX + 1.1, -1.35);
  ctx.lineTo(rightX + 0.15, 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Base ground ballast footings
  ctx.fillStyle = '#0369a1';
  const plateW = 0.32;
  const plateD = 0.32;
  // Left footing
  ctx.fillRect(-w / 2, -plateD / 2, plateW, plateD);
  // Right footing (reinforced for 2.5m tall pole side)
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(w / 2 - plateW, -plateD / 2, plateW, plateD);

  // Ground baseline between uprights
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(leftX, 0);
  ctx.lineTo(rightX, 0);
  ctx.stroke();

  // 3. 1.5m Single Arch Tube
  ctx.strokeStyle = isSelected ? '#bae6fd' : isHovered ? '#7dd3fc' : '#0284c7';
  ctx.lineWidth = 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // Left post
  ctx.moveTo(leftX, 0);
  ctx.lineTo(leftX, -archH);
  // Arch apex
  ctx.bezierCurveTo(leftX, archApexY, rightX, archApexY, rightX, -archH);
  // Right post down to ground
  ctx.lineTo(rightX, 0);
  ctx.stroke();

  // Glowing Neon LED Inner Strip
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(leftX, 0);
  ctx.lineTo(leftX, -archH);
  ctx.bezierCurveTo(leftX, archApexY, rightX, archApexY, rightX, -archH);
  ctx.lineTo(rightX, 0);
  ctx.stroke();

  // 4. Coupling Collar & 1.0m Extension Pole on top of right side (rising from 1.5m to 2.5m)
  // Coupling bracket / mount collar at 1.5m
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(rightX - 0.12, -archH - 0.08, 0.24, 0.16);

  // Extension pole shaft (from 1.5m to 2.5m)
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(rightX, -archH);
  ctx.lineTo(rightX, poleTopY);
  ctx.stroke();

  // High-visibility yellow spiral wraps on the 1m extension pole
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(rightX, -archH - 0.25);
  ctx.lineTo(rightX, -archH - 0.4);
  ctx.moveTo(rightX, -archH - 0.65);
  ctx.lineTo(rightX, -archH - 0.8);
  ctx.stroke();

  // Top finial ball at 2.5m
  ctx.fillStyle = '#fb923c';
  ctx.beginPath();
  ctx.arc(rightX, poleTopY, 0.12, 0, Math.PI * 2);
  ctx.fill();

  // High-visibility slalom flag at 2.5m pole top
  ctx.fillStyle = 'rgba(234, 88, 12, 0.95)';
  ctx.beginPath();
  ctx.moveTo(rightX, poleTopY);
  ctx.lineTo(rightX + 0.42, poleTopY + 0.15);
  ctx.lineTo(rightX, poleTopY + 0.32);
  ctx.closePath();
  ctx.fill();

  // Directional forward entry arrow
  drawForwardArrow(ctx, 0, archApexY - 0.55, '#38bdf8');
}

function getTierPassSequence(
  tierCenters: { tier: number; x: number; y: number }[],
  drawnPath: TrackPoint[]
): Map<number, number> {
  const result = new Map<number, number>();
  if (!drawnPath || drawnPath.length === 0) return result;

  const passes: { tier: number; firstIdx: number }[] = [];
  tierCenters.forEach((tc) => {
    let idx = -1;
    for (let i = 0; i < drawnPath.length; i++) {
      if (Math.hypot(drawnPath[i].x - tc.x, drawnPath[i].y - tc.y) <= 1.35) {
        idx = i;
        break;
      }
    }
    if (idx !== -1) {
      passes.push({ tier: tc.tier, firstIdx: idx });
    }
  });

  passes.sort((a, b) => a.firstIdx - b.firstIdx);
  passes.forEach((p, order) => {
    result.set(p.tier, order + 1);
  });
  return result;
}

function getOrderLabel(order: number): string {
  if (order === 1) return '1st';
  if (order === 2) return '2nd';
  if (order === 3) return '3rd';
  return `${order}th`;
}

function drawVerticalDoubleGate(
  ctx: CanvasRenderingContext2D,
  equip: EquipmentDef,
  isSelected: boolean,
  isHovered: boolean,
  item?: PlacedItem,
  drawnPath: TrackPoint[] = []
) {
  const w = 2.0; // 2.0m width
  const d = 0.5; // depth
  const elevX = 0.55;
  const elevY = -1.9;

  // Calculate pass sequence if drawnPath exists
  let tierPasses = new Map<number, number>();
  if (item && drawnPath.length > 0) {
    const rad = (item.rotation * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const tierCenters = [
      { tier: 1, x: item.x, y: item.y },
      { tier: 2, x: item.x + cosR * elevX - sinR * elevY, y: item.y + sinR * elevX + cosR * elevY },
    ];
    tierPasses = getTierPassSequence(tierCenters, drawnPath);
  }

  // 1. Cast shadow for 4m tall double stack
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.beginPath();
  ctx.moveTo(-w / 2, d / 2);
  ctx.lineTo(-w / 2 + 1.6, d / 2 - 2.2);
  ctx.lineTo(w / 2 + 1.6, d / 2 - 2.2);
  ctx.lineTo(w / 2, d / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Continuous 4m side vertical upright truss pillars (connecting ground to 4m upper gate)
  ctx.strokeStyle = isSelected ? '#e9d5ff' : '#7e22ce';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  // Left post
  ctx.moveTo(-w / 2, -d / 2);
  ctx.lineTo(-w / 2 + elevX, -d / 2 + elevY);
  // Right post
  ctx.moveTo(w / 2, -d / 2);
  ctx.lineTo(w / 2 + elevX, -d / 2 + elevY);
  // Rear posts
  ctx.moveTo(-w / 2, d / 2);
  ctx.lineTo(-w / 2 + elevX, d / 2 + elevY);
  ctx.moveTo(w / 2, d / 2);
  ctx.lineTo(w / 2 + elevX, d / 2 + elevY);
  ctx.stroke();

  // Diagonal cross braces on side columns
  ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -d / 2);
  ctx.lineTo(-w / 2 + elevX, d / 2 + elevY);
  ctx.moveTo(w / 2, -d / 2);
  ctx.lineTo(w / 2 + elevX, d / 2 + elevY);
  ctx.stroke();

  // Joint divider coupling plate at 2m line (between Gate 1 and Gate 2)
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + elevX * 0.5, -d / 2 + elevY * 0.5);
  ctx.lineTo(w / 2 + elevX * 0.5, -d / 2 + elevY * 0.5);
  ctx.stroke();

  // --- GATE 1: GROUND 2m × 2m GATE (0m to 2m) ---
  const g1Passed = tierPasses.has(1);
  const g1Order = tierPasses.get(1);
  const g1Targeted = item?.targetTier === 'tier1' || item?.targetTier === 'ladder_up';

  ctx.save();
  ctx.fillStyle = g1Passed ? 'rgba(16, 185, 129, 0.35)' : 'rgba(88, 28, 135, 0.35)';
  ctx.fillRect(-w / 2, -d / 2, w, d);

  // Ground base ballast plates
  ctx.fillStyle = '#6b21a8';
  ctx.fillRect(-w / 2, -d / 2, 0.35, d);
  ctx.fillRect(w / 2 - 0.35, -d / 2, 0.35, d);

  // Outer frame
  ctx.strokeStyle = g1Passed ? '#34d399' : isSelected ? '#f5d0fe' : '#9333ea';
  ctx.lineWidth = g1Passed || g1Targeted ? 0.12 : 0.08;
  ctx.strokeRect(-w / 2, -d / 2, w, d);

  // Inner aperture
  ctx.strokeStyle = g1Passed ? '#10b981' : '#c084fc';
  ctx.lineWidth = 0.05;
  ctx.strokeRect(-w / 2 + 0.15, -d / 2 + 0.1, w - 0.3, d - 0.2);
  ctx.restore();

  // --- GATE 2: UPPER 2m × 2m GATE (2m to 4m) ---
  const g2Passed = tierPasses.has(2);
  const g2Order = tierPasses.get(2);
  const g2Targeted = item?.targetTier === 'tier2' || item?.targetTier === 'ladder_down';

  ctx.save();
  ctx.translate(elevX, elevY);

  ctx.fillStyle = g2Passed ? 'rgba(16, 185, 129, 0.38)' : 'rgba(147, 51, 234, 0.45)';
  ctx.fillRect(-w / 2, -d / 2, w, d);

  ctx.strokeStyle = g2Passed ? '#34d399' : isSelected ? '#fdf4ff' : '#c084fc';
  ctx.lineWidth = g2Passed || g2Targeted ? 0.12 : 0.09;
  ctx.strokeRect(-w / 2, -d / 2, w, d);

  // Glowing upper neon aperture
  ctx.strokeStyle = g2Passed ? '#6ee7b7' : '#e879f9';
  ctx.lineWidth = 0.06;
  ctx.strokeRect(-w / 2 + 0.15, -d / 2 + 0.1, w - 0.3, d - 0.2);
  ctx.restore();

  drawForwardArrow(ctx, elevX, elevY - d / 2 - 0.3, '#c084fc');
}

function drawVerticalTripleGate(
  ctx: CanvasRenderingContext2D,
  equip: EquipmentDef,
  isSelected: boolean,
  isHovered: boolean,
  item?: PlacedItem,
  drawnPath: TrackPoint[] = []
) {
  const w = 2.0; // 2.0m width
  const d = 0.5; // depth
  const elevX = 0.55;
  const elevY = -1.9;

  // Calculate pass sequence if drawnPath exists
  let tierPasses = new Map<number, number>();
  if (item && drawnPath.length > 0) {
    const rad = (item.rotation * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const tierCenters = [
      { tier: 1, x: item.x, y: item.y },
      { tier: 2, x: item.x + cosR * elevX - sinR * elevY, y: item.y + sinR * elevX + cosR * elevY },
      { tier: 3, x: item.x + cosR * elevX * 2 - sinR * elevY * 2, y: item.y + sinR * elevX * 2 + cosR * elevY * 2 },
    ];
    tierPasses = getTierPassSequence(tierCenters, drawnPath);
  }

  // 1. Ground cast shadow for tall 6m triple stack tower
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.beginPath();
  ctx.moveTo(-w / 2, d / 2);
  ctx.lineTo(-w / 2 + 2.2, d / 2 - 3.8);
  ctx.lineTo(w / 2 + 2.2, d / 2 - 3.8);
  ctx.lineTo(w / 2, d / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Continuous vertical truss uprights connecting all 3 tiers (0m -> 2m -> 4m -> 6m)
  ctx.strokeStyle = isSelected ? '#f5d0fe' : '#7e22ce';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  // Left post
  ctx.moveTo(-w / 2, -d / 2);
  ctx.lineTo(-w / 2 + elevX * 2, -d / 2 + elevY * 2);
  // Right post
  ctx.moveTo(w / 2, -d / 2);
  ctx.lineTo(w / 2 + elevX * 2, -d / 2 + elevY * 2);
  // Rear posts
  ctx.moveTo(-w / 2, d / 2);
  ctx.lineTo(-w / 2 + elevX * 2, d / 2 + elevY * 2);
  ctx.moveTo(w / 2, d / 2);
  ctx.lineTo(w / 2 + elevX * 2, d / 2 + elevY * 2);
  ctx.stroke();

  // Cross-bracing between tiers
  ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  // Lower tier cross brace
  ctx.moveTo(-w / 2, -d / 2);
  ctx.lineTo(-w / 2 + elevX, d / 2 + elevY);
  ctx.moveTo(w / 2, -d / 2);
  ctx.lineTo(w / 2 + elevX, d / 2 + elevY);
  // Upper tier cross brace
  ctx.moveTo(-w / 2 + elevX, -d / 2 + elevY);
  ctx.lineTo(-w / 2 + elevX * 2, d / 2 + elevY * 2);
  ctx.moveTo(w / 2 + elevX, -d / 2 + elevY);
  ctx.lineTo(w / 2 + elevX * 2, d / 2 + elevY * 2);
  ctx.stroke();

  // Divider joints at 2m and 4m
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  // 2m joint
  ctx.moveTo(-w / 2 + elevX * 0.5, -d / 2 + elevY * 0.5);
  ctx.lineTo(w / 2 + elevX * 0.5, -d / 2 + elevY * 0.5);
  // 4m joint
  ctx.moveTo(-w / 2 + elevX * 1.5, -d / 2 + elevY * 1.5);
  ctx.lineTo(w / 2 + elevX * 1.5, -d / 2 + elevY * 1.5);
  ctx.stroke();

  // --- GATE 1: GROUND 2m × 2m GATE (0m to 2m) ---
  const g1Passed = tierPasses.has(1);
  const g1Order = tierPasses.get(1);
  const g1Targeted = item?.targetTier === 'tier1' || item?.targetTier === 'ladder_up';

  ctx.save();
  ctx.fillStyle = g1Passed ? 'rgba(16, 185, 129, 0.35)' : 'rgba(88, 28, 135, 0.4)';
  ctx.fillRect(-w / 2, -d / 2, w, d);

  // Ground base ballast plates
  ctx.fillStyle = '#581c87';
  ctx.fillRect(-w / 2, -d / 2, 0.35, d);
  ctx.fillRect(w / 2 - 0.35, -d / 2, 0.35, d);

  ctx.strokeStyle = g1Passed ? '#34d399' : isSelected ? '#e9d5ff' : '#9333ea';
  ctx.lineWidth = g1Passed || g1Targeted ? 0.12 : 0.08;
  ctx.strokeRect(-w / 2, -d / 2, w, d);

  // Inner aperture
  ctx.strokeStyle = g1Passed ? '#10b981' : '#a855f7';
  ctx.lineWidth = 0.05;
  ctx.strokeRect(-w / 2 + 0.15, -d / 2 + 0.1, w - 0.3, d - 0.2);
  ctx.restore();

  // --- GATE 2: MIDDLE 2m × 2m GATE (2m to 4m) ---
  const g2Passed = tierPasses.has(2);
  const g2Order = tierPasses.get(2);
  const g2Targeted = item?.targetTier === 'tier2';

  ctx.save();
  ctx.translate(elevX, elevY);

  ctx.fillStyle = g2Passed ? 'rgba(16, 185, 129, 0.38)' : 'rgba(126, 34, 206, 0.45)';
  ctx.fillRect(-w / 2, -d / 2, w, d);

  ctx.strokeStyle = g2Passed ? '#34d399' : isSelected ? '#f5d0fe' : '#a855f7';
  ctx.lineWidth = g2Passed || g2Targeted ? 0.12 : 0.09;
  ctx.strokeRect(-w / 2, -d / 2, w, d);

  ctx.strokeStyle = g2Passed ? '#6ee7b7' : '#c084fc';
  ctx.lineWidth = 0.05;
  ctx.strokeRect(-w / 2 + 0.15, -d / 2 + 0.1, w - 0.3, d - 0.2);
  ctx.restore();

  // --- GATE 3: TOP 2m × 2m GATE (4m to 6m) ---
  const g3Passed = tierPasses.has(3);
  const g3Order = tierPasses.get(3);
  const g3Targeted = item?.targetTier === 'tier3' || item?.targetTier === 'ladder_down';

  ctx.save();
  ctx.translate(elevX * 2, elevY * 2);

  ctx.fillStyle = g3Passed ? 'rgba(16, 185, 129, 0.42)' : 'rgba(147, 51, 234, 0.5)';
  ctx.fillRect(-w / 2, -d / 2, w, d);

  ctx.strokeStyle = g3Passed ? '#34d399' : isSelected ? '#fdf4ff' : '#c084fc';
  ctx.lineWidth = g3Passed || g3Targeted ? 0.13 : 0.1;
  ctx.strokeRect(-w / 2, -d / 2, w, d);

  // Glowing neon top aperture
  ctx.strokeStyle = g3Passed ? '#a7f3d0' : '#f0abfc';
  ctx.lineWidth = 0.06;
  ctx.strokeRect(-w / 2 + 0.15, -d / 2 + 0.1, w - 0.3, d - 0.2);
  ctx.restore();

  // Forward direction arrow at top tier
  drawForwardArrow(ctx, elevX * 2, elevY * 2 - d / 2 - 0.3, '#f0abfc');
}

function drawVerticalQuadGate(
  ctx: CanvasRenderingContext2D,
  equip: EquipmentDef,
  isSelected: boolean,
  isHovered: boolean,
  item?: PlacedItem,
  drawnPath: TrackPoint[] = []
) {
  const w = 2.0; // 2.0m width
  const d = 0.5; // depth
  const elevX = 0.45;
  const elevY = -1.45; // 4 tiers (0m, 2m, 4m, 6m, 8m)

  // Calculate pass sequence if drawnPath exists
  let tierPasses = new Map<number, number>();
  if (item && drawnPath.length > 0) {
    const rad = (item.rotation * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const tierCenters = [
      { tier: 1, x: item.x, y: item.y },
      { tier: 2, x: item.x + cosR * elevX - sinR * elevY, y: item.y + sinR * elevX + cosR * elevY },
      { tier: 3, x: item.x + cosR * elevX * 2 - sinR * elevY * 2, y: item.y + sinR * elevX * 2 + cosR * elevY * 2 },
      { tier: 4, x: item.x + cosR * elevX * 3 - sinR * elevY * 3, y: item.y + sinR * elevX * 3 + cosR * elevY * 3 },
    ];
    tierPasses = getTierPassSequence(tierCenters, drawnPath);
  }

  // 1. Ground cast shadow for tall 8m quad stack tower
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.moveTo(-w / 2, d / 2);
  ctx.lineTo(-w / 2 + 2.8, d / 2 - 5.0);
  ctx.lineTo(w / 2 + 2.8, d / 2 - 5.0);
  ctx.lineTo(w / 2, d / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Continuous vertical truss uprights connecting all 4 tiers (0m -> 2m -> 4m -> 6m -> 8m)
  ctx.strokeStyle = isSelected ? '#f5d0fe' : '#581c87';
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -d / 2);
  ctx.lineTo(-w / 2 + elevX * 3, -d / 2 + elevY * 3);
  ctx.moveTo(w / 2, -d / 2);
  ctx.lineTo(w / 2 + elevX * 3, -d / 2 + elevY * 3);
  ctx.moveTo(-w / 2, d / 2);
  ctx.lineTo(-w / 2 + elevX * 3, d / 2 + elevY * 3);
  ctx.moveTo(w / 2, d / 2);
  ctx.lineTo(w / 2 + elevX * 3, d / 2 + elevY * 3);
  ctx.stroke();

  // Diagonal cross braces across tiers
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  for (let t = 0; t < 3; t++) {
    ctx.moveTo(-w / 2 + elevX * t, -d / 2 + elevY * t);
    ctx.lineTo(-w / 2 + elevX * (t + 1), d / 2 + elevY * (t + 1));
    ctx.moveTo(w / 2 + elevX * t, -d / 2 + elevY * t);
    ctx.lineTo(w / 2 + elevX * (t + 1), d / 2 + elevY * (t + 1));
  }
  ctx.stroke();

  // Divider joints at 2m, 4m, and 6m
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  for (let t = 1; t <= 3; t++) {
    ctx.moveTo(-w / 2 + elevX * t, -d / 2 + elevY * t);
    ctx.lineTo(w / 2 + elevX * t, -d / 2 + elevY * t);
  }
  ctx.stroke();

  // --- GATE 1: GROUND 2m × 2m GATE (0m to 2m) ---
  const g1Passed = tierPasses.has(1);
  const g1Order = tierPasses.get(1);
  const g1Targeted = item?.targetTier === 'tier1' || item?.targetTier === 1 || item?.targetTier === 'ladder_up';

  ctx.save();
  ctx.fillStyle = g1Passed ? 'rgba(16, 185, 129, 0.35)' : 'rgba(88, 28, 135, 0.4)';
  ctx.fillRect(-w / 2, -d / 2, w, d);
  ctx.fillStyle = '#3b0764';
  ctx.fillRect(-w / 2, -d / 2, 0.35, d);
  ctx.fillRect(w / 2 - 0.35, -d / 2, 0.35, d);

  ctx.strokeStyle = g1Passed ? '#34d399' : isSelected ? '#e9d5ff' : '#9333ea';
  ctx.lineWidth = g1Passed || g1Targeted ? 0.12 : 0.08;
  ctx.strokeRect(-w / 2, -d / 2, w, d);
  ctx.strokeStyle = g1Passed ? '#10b981' : '#a855f7';
  ctx.lineWidth = 0.05;
  ctx.strokeRect(-w / 2 + 0.15, -d / 2 + 0.1, w - 0.3, d - 0.2);
  ctx.restore();

  // --- GATE 2: TIER 2 2m × 2m GATE (2m to 4m) ---
  const g2Passed = tierPasses.has(2);
  const g2Order = tierPasses.get(2);
  const g2Targeted = item?.targetTier === 'tier2' || item?.targetTier === 2;

  ctx.save();
  ctx.translate(elevX, elevY);
  ctx.fillStyle = g2Passed ? 'rgba(16, 185, 129, 0.38)' : 'rgba(107, 33, 168, 0.42)';
  ctx.fillRect(-w / 2, -d / 2, w, d);

  ctx.strokeStyle = g2Passed ? '#34d399' : isSelected ? '#f5d0fe' : '#a855f7';
  ctx.lineWidth = g2Passed || g2Targeted ? 0.12 : 0.09;
  ctx.strokeRect(-w / 2, -d / 2, w, d);
  ctx.strokeStyle = g2Passed ? '#6ee7b7' : '#c084fc';
  ctx.lineWidth = 0.05;
  ctx.strokeRect(-w / 2 + 0.15, -d / 2 + 0.1, w - 0.3, d - 0.2);
  ctx.restore();

  // --- GATE 3: TIER 3 2m × 2m GATE (4m to 6m) ---
  const g3Passed = tierPasses.has(3);
  const g3Order = tierPasses.get(3);
  const g3Targeted = item?.targetTier === 'tier3' || item?.targetTier === 3;

  ctx.save();
  ctx.translate(elevX * 2, elevY * 2);
  ctx.fillStyle = g3Passed ? 'rgba(16, 185, 129, 0.42)' : 'rgba(126, 34, 206, 0.46)';
  ctx.fillRect(-w / 2, -d / 2, w, d);

  ctx.strokeStyle = g3Passed ? '#34d399' : isSelected ? '#fdf4ff' : '#c084fc';
  ctx.lineWidth = g3Passed || g3Targeted ? 0.12 : 0.09;
  ctx.strokeRect(-w / 2, -d / 2, w, d);
  ctx.strokeStyle = g3Passed ? '#a7f3d0' : '#d8b4fe';
  ctx.lineWidth = 0.05;
  ctx.strokeRect(-w / 2 + 0.15, -d / 2 + 0.1, w - 0.3, d - 0.2);
  ctx.restore();

  // --- GATE 4: TOP TIER 4 2m × 2m GATE (6m to 8m) ---
  const g4Passed = tierPasses.has(4);
  const g4Order = tierPasses.get(4);
  const g4Targeted = item?.targetTier === 'tier4' || item?.targetTier === 4 || item?.targetTier === 'ladder_down';

  ctx.save();
  ctx.translate(elevX * 3, elevY * 3);
  ctx.fillStyle = g4Passed ? 'rgba(16, 185, 129, 0.46)' : 'rgba(147, 51, 234, 0.52)';
  ctx.fillRect(-w / 2, -d / 2, w, d);

  ctx.strokeStyle = g4Passed ? '#34d399' : isSelected ? '#ffffff' : '#e879f9';
  ctx.lineWidth = g4Passed || g4Targeted ? 0.14 : 0.1;
  ctx.strokeRect(-w / 2, -d / 2, w, d);
  ctx.strokeStyle = g4Passed ? '#a7f3d0' : '#f0abfc';
  ctx.lineWidth = 0.06;
  ctx.strokeRect(-w / 2 + 0.15, -d / 2 + 0.1, w - 0.3, d - 0.2);
  ctx.restore();

  // Forward direction arrow at top tier
  drawForwardArrow(ctx, elevX * 3, elevY * 3 - d / 2 - 0.3, '#f0abfc');
}

function drawFlagPole(
  ctx: CanvasRenderingContext2D,
  _equip: EquipmentDef,
  isSelected: boolean,
  isHovered: boolean
) {
  const r = 0.55; // radius in meters
  const mastElevX = 0.4;
  const mastElevY = -1.8; // 3D elevated mast tip for 3m height

  // 1. Ground Cast Shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(1.2, 0.8);
  ctx.lineTo(1.6, 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. 3D Orbit Guidance Zone (Guides how drone loops around the pole)
  ctx.save();
  const orbitR = 1.8; // 1.8m orbit zone
  ctx.setLineDash([0.35, 0.25]);
  ctx.strokeStyle = isSelected ? 'rgba(251, 146, 60, 0.85)' : 'rgba(234, 88, 12, 0.45)';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(0, 0, orbitR, 0, Math.PI * 2);
  ctx.stroke();

  // Rotational Orbit Chevrons around circumference
  ctx.setLineDash([]);
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
    const ax = Math.cos(angle) * orbitR;
    const ay = Math.sin(angle) * orbitR;
    const tangent = angle + Math.PI / 2;

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(tangent);
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.moveTo(0.2, 0);
    ctx.lineTo(-0.15, -0.12);
    ctx.lineTo(-0.06, 0);
    ctx.lineTo(-0.15, 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // 3. Ground Ballast Base Plate
  ctx.fillStyle = isSelected ? '#fb923c' : '#ea580c';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#c2410c';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // Central Anchor Bolt / Ground Dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 0.18, 0, Math.PI * 2);
  ctx.fill();

  // 4. 3D Flexible Carbon Fiber Mast (Rising 3m into the air)
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(mastElevX * 0.3, mastElevY * 0.6, mastElevX, mastElevY);
  ctx.stroke();

  // 5. Fluttering Teardrop Racing Banner at Tip
  ctx.save();
  ctx.translate(mastElevX, mastElevY);

  // Outer orange sail
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(0.8, -0.3, 1.1, 0.4, 0.2, 0.8);
  ctx.closePath();
  ctx.fill();

  // White aerodynamic stripe
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0.1, 0.1);
  ctx.bezierCurveTo(0.5, -0.1, 0.7, 0.3, 0.2, 0.5);
  ctx.closePath();
  ctx.fill();

  // Tip strobe beacon
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(0, 0, 0.09, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCubeGate(
  ctx: CanvasRenderingContext2D,
  equip: EquipmentDef,
  isSelected: boolean,
  isHovered: boolean
) {
  const size = equip.width; // 2.0m x 2.0m
  const half = size / 2;
  const elevX = 0.35;
  const elevY = -1.1; // 2m 3D isometric height offset

  // 1. Cast shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.moveTo(-half, half);
  ctx.lineTo(-half + 1.2, half + 0.6);
  ctx.lineTo(half + 1.2, half + 0.6);
  ctx.lineTo(half, half);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Ground Base Level (0m)
  ctx.fillStyle = 'rgba(5, 150, 105, 0.18)';
  ctx.fillRect(-half, -half, size, size);

  // Corner anchor pads
  ctx.fillStyle = '#047857';
  const pad = 0.32;
  ctx.fillRect(-half, -half, pad, pad);
  ctx.fillRect(half - pad, -half, pad, pad);
  ctx.fillRect(half - pad, half - pad, pad, pad);
  ctx.fillRect(-half, half - pad, pad, pad);

  // Base frame
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 0.06;
  ctx.strokeRect(-half, -half, size, size);

  // 3. Four 2m Vertical Corner Struts
  const corners = [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ];
  ctx.strokeStyle = isSelected ? '#a7f3d0' : isHovered ? '#6ee7b7' : '#10b981';
  ctx.lineWidth = 0.07;
  corners.forEach((c) => {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + elevX, c.y + elevY);
    ctx.stroke();
  });

  // Wireframe diagonals on side walls
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(-half, -half);
  ctx.lineTo(-half + elevX, half + elevY);
  ctx.moveTo(half, -half);
  ctx.lineTo(half + elevX, half + elevY);
  ctx.stroke();

  // 4. Elevated Top 2m Square Frame (2m Height)
  ctx.save();
  ctx.translate(elevX, elevY);

  ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.fillRect(-half, -half, size, size);

  ctx.strokeStyle = isSelected ? '#d1fae5' : '#34d399';
  ctx.lineWidth = 0.09;
  ctx.strokeRect(-half, -half, size, size);

  // Top tunnel opening indicator
  ctx.strokeStyle = '#6ee7b7';
  ctx.lineWidth = 0.05;
  ctx.strokeRect(-half + 0.2, -half + 0.2, size - 0.4, size - 0.4);
  ctx.restore();

  drawForwardArrow(ctx, elevX, elevY - half - 0.35, '#34d399');
}

function drawDoubleCubeGate(
  ctx: CanvasRenderingContext2D,
  _equip: EquipmentDef,
  isSelected: boolean,
  isHovered: boolean,
  item?: PlacedItem,
  drawnPath: TrackPoint[] = []
) {
  // Footprint: 2.0m x 2.0m ground base, 4.0m vertical height (Two 2m x 2m x 2m cubes stacked)!
  const s = 2.0;
  const half = s / 2; // 1.0m

  // 3D Isometric projection vector for 4.0m height:
  const elevX = 0.55;
  const elevY = -2.0;
  const midX = elevX * 0.5;
  const midY = elevY * 0.5;

  // Pass detection
  let cubePasses = new Map<number, number>();
  if (item && drawnPath.length > 0) {
    const rad = (item.rotation * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const cubeCenters = [
      { tier: 1, x: item.x, y: item.y },
      { tier: 2, x: item.x + cosR * midX - sinR * midY, y: item.y + sinR * midX + cosR * midY },
    ];
    cubePasses = getTierPassSequence(cubeCenters, drawnPath);
  }

  // 1. Cast Ground Shadow (elongated 4m shadow)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.moveTo(-half, -half);
  ctx.lineTo(-half + 2.0, -half + 1.6);
  ctx.lineTo(half + 2.0, half + 1.6);
  ctx.lineTo(half, half);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Continuous 4m Corner Columns
  const corners = [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ];
  ctx.strokeStyle = isSelected ? '#a7f3d0' : isHovered ? '#6ee7b7' : '#059669';
  ctx.lineWidth = 0.08;
  corners.forEach((c) => {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + elevX, c.y + elevY);
    ctx.stroke();
  });

  // Cross-bracing lattice diagonals on side walls
  ctx.strokeStyle = 'rgba(5, 150, 105, 0.4)';
  ctx.lineWidth = 0.04;
  // Cube 1 diagonals (0-2m)
  ctx.beginPath();
  ctx.moveTo(-half, -half);
  ctx.lineTo(-half + midX, half + midY);
  ctx.moveTo(-half, half);
  ctx.lineTo(-half + midX, -half + midY);
  ctx.moveTo(half, -half);
  ctx.lineTo(half + midX, half + midY);
  ctx.moveTo(half, half);
  ctx.lineTo(half + midX, -half + midY);
  // Cube 2 diagonals (2-4m)
  ctx.moveTo(-half + midX, -half + midY);
  ctx.lineTo(-half + elevX, half + elevY);
  ctx.moveTo(-half + midX, half + midY);
  ctx.lineTo(-half + elevX, -half + elevY);
  ctx.moveTo(half + midX, -half + midY);
  ctx.lineTo(half + elevX, half + elevY);
  ctx.moveTo(half + midX, half + midY);
  ctx.lineTo(half + elevX, -half + elevY);
  ctx.stroke();

  // --- CUBE 1: LOWER 2m × 2m × 2m CUBE (0m to 2m) ---
  const c1Passed = cubePasses.has(1);
  const c1Order = cubePasses.get(1);

  ctx.save();
  ctx.fillStyle = c1Passed ? 'rgba(16, 185, 129, 0.32)' : 'rgba(6, 78, 59, 0.35)';
  ctx.fillRect(-half, -half, s, s);

  // Steel corner base plates
  ctx.fillStyle = '#047857';
  const plate = 0.35;
  ctx.fillRect(-half, -half, plate, plate);
  ctx.fillRect(half - plate, -half, plate, plate);
  ctx.fillRect(half - plate, half - plate, plate, plate);
  ctx.fillRect(-half, half - plate, plate, plate);

  // Base perimeter
  ctx.strokeStyle = c1Passed ? '#34d399' : '#065f46';
  ctx.lineWidth = 0.07;
  ctx.strokeRect(-half, -half, s, s);

  // Ground Level Exit Aperture (Front wall)
  ctx.strokeStyle = c1Passed ? '#6ee7b7' : '#10b981';
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  ctx.moveTo(-half + 0.25, half);
  ctx.lineTo(half - 0.25, half);
  ctx.stroke();

  // Forward exit pull-out arrow
  drawForwardArrow(ctx, 0, half + 0.35, '#10b981');
  ctx.restore();

  // --- INTER-CUBE COUPLING RING AT 2m ELEVATION ---
  ctx.save();
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 0.09;
  ctx.strokeRect(-half + midX, -half + midY, s, s);

  // Divider joints
  ctx.fillStyle = '#059669';
  [
    [-half + midX, -half + midY],
    [half + midX, -half + midY],
    [half + midX, half + midY],
    [-half + midX, half + midY],
  ].forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 0.09, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // --- CUBE 2: UPPER 2m × 2m × 2m CUBE (2m to 4m) ---
  const c2Passed = cubePasses.has(2);
  const c2Order = cubePasses.get(2);

  // Vertical Chute Shading (Vertical Dive Tunnel into Cube 2)
  const chuteGrad = ctx.createLinearGradient(0, elevY, 0, midY);
  chuteGrad.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
  chuteGrad.addColorStop(0.5, 'rgba(6, 95, 70, 0.4)');
  chuteGrad.addColorStop(1, 'rgba(4, 120, 87, 0.2)');
  ctx.fillStyle = chuteGrad;
  ctx.beginPath();
  ctx.moveTo(-half + elevX, -half + elevY);
  ctx.lineTo(half + elevX, -half + elevY);
  ctx.lineTo(half + midX, half + midY);
  ctx.lineTo(-half + midX, half + midY);
  ctx.closePath();
  ctx.fill();

  // Vertical Dive Speed Descent Streaks
  ctx.strokeStyle = 'rgba(110, 231, 183, 0.5)';
  ctx.lineWidth = 0.04;
  ctx.setLineDash([0.3, 0.3]);
  for (let offset of [-0.4, 0, 0.4]) {
    ctx.beginPath();
    ctx.moveTo(offset + elevX, elevY);
    ctx.lineTo(offset + midX, midY);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // TOP DIVE ENTRANCE PORTAL (Elevated at 4.0m)
  ctx.save();
  ctx.translate(elevX, elevY);

  // Top ring outer glow
  ctx.strokeStyle = c2Passed ? '#34d399' : isSelected ? '#ecfdf5' : '#10b981';
  ctx.lineWidth = c2Passed || isSelected ? 0.14 : 0.11;
  ctx.strokeRect(-half, -half, s, s);

  // Top ring inner border
  ctx.strokeStyle = '#a7f3d0';
  ctx.lineWidth = 0.05;
  ctx.strokeRect(-half + 0.15, -half + 0.15, s - 0.3, s - 0.3);

  // Corner LED strobes
  ctx.fillStyle = '#f0fdf4';
  const cr = 0.12;
  [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ].forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  });

  // Concentric Dive Target Bulls-Eye
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(0, 0, 0.6, 0, Math.PI * 2);
  ctx.stroke();

  // Downward Dive Target Icon
  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.moveTo(0, 0.22);
  ctx.lineTo(-0.2, -0.12);
  ctx.lineTo(-0.08, -0.12);
  ctx.lineTo(-0.08, -0.22);
  ctx.lineTo(0.08, -0.22);
  ctx.lineTo(0.08, -0.12);
  ctx.lineTo(0.2, -0.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawForwardArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 0.25);
  ctx.lineTo(x - 0.2, y + 0.1);
  ctx.lineTo(x + 0.2, y + 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawItemLabels(
  ctx: CanvasRenderingContext2D,
  item: PlacedItem,
  equip: EquipmentDef,
  isSelected: boolean
) {
  ctx.save();
  ctx.translate(item.x, item.y);

  // Calculate base Y offset depending on 3D height of object
  const baseY =
    equip.visualType === 'vertical_quad'
      ? -equip.depth / 2 - 4.6
      : equip.visualType === 'vertical_triple'
      ? -equip.depth / 2 - 3.4
      : equip.visualType === 'single_gate_lightblue'
      ? -equip.depth / 2 - 2.85
      : equip.visualType === 'double_cube'
      ? -equip.depth / 2 - 3.0
      : equip.visualType === 'vertical_double'
      ? -equip.depth / 2 - 2.4
      : equip.visualType === 'cube_gate'
      ? -equip.depth / 2 - 2.0
      : -equip.depth / 2 - 1.2;

  // 1. Waypoint / Sequence Order Badge
  if (item.sequenceOrder !== null) {
    const isStart = item.sequenceOrder === 1;
    const badgeText = isStart ? '1 (START)' : `${item.sequenceOrder}`;
    ctx.font = 'bold 0.75px "JetBrains Mono", monospace';
    const textWidth = ctx.measureText(badgeText).width;
    const badgeW = Math.max(1.2, textWidth + 0.6);
    const badgeH = 0.95;

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(-badgeW / 2 + 0.05, baseY - badgeH / 2 + 0.05, badgeW, badgeH, 0.25);
    ctx.fill();

    // Badge fill
    ctx.fillStyle = isStart ? '#10b981' : isSelected ? '#f59e0b' : '#0284c7';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.06;

    ctx.beginPath();
    ctx.roundRect(-badgeW / 2, baseY - badgeH / 2, badgeW, badgeH, 0.25);
    ctx.fill();
    ctx.stroke();

    // Badge text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, 0, baseY + 0.05);
  }

  ctx.restore();
}

function drawFlightManeuverBadge(
  ctx: CanvasRenderingContext2D,
  item: PlacedItem,
  isSelected: boolean,
  isDragging: boolean,
  isHovered: boolean,
  isRotating: boolean = false,
  isHoveredRotateHandle: boolean = false
) {
  const layout = getManeuverBadgeLayout(item);
  if (!layout) return;

  const { x, y, width, height, rotation, text, gateEdgeX, gateEdgeY } = layout;

  ctx.save();

  // 1. Connecting dashed pointer line from gate to maneuver badge (drawn in world space)
  ctx.save();
  ctx.strokeStyle = isDragging || isRotating
    ? '#fbbf24'
    : isSelected
    ? '#f59e0b'
    : isHovered
    ? 'rgba(251, 191, 36, 0.9)'
    : 'rgba(245, 158, 11, 0.65)';
  ctx.lineWidth = isDragging || isRotating || isSelected ? 0.06 : 0.04;
  ctx.setLineDash([0.16, 0.1]);
  ctx.beginPath();
  ctx.moveTo(gateEdgeX, gateEdgeY);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Connection anchor dot on gate
  ctx.fillStyle = isDragging || isRotating || isSelected ? '#fbbf24' : '#f59e0b';
  ctx.beginPath();
  ctx.arc(gateEdgeX, gateEdgeY, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Transform to badge center and apply rotation
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);

  // Outer Glow when dragging, rotating, selected, or hovered
  if (isDragging || isRotating || isSelected || isHovered) {
    ctx.fillStyle = isDragging || isRotating
      ? 'rgba(245, 158, 11, 0.35)'
      : isSelected
      ? 'rgba(245, 158, 11, 0.2)'
      : 'rgba(245, 158, 11, 0.12)';
    ctx.beginPath();
    ctx.roundRect(-width / 2 - 0.12, -height / 2 - 0.12, width + 0.24, height + 0.24, 0.26);
    ctx.fill();
  }

  // Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.roundRect(-width / 2 + 0.08, -height / 2 + 0.08, width, height, 0.22);
  ctx.fill();

  // Pill Body Background
  ctx.fillStyle = isDragging || isRotating
    ? 'rgba(69, 26, 3, 0.98)'
    : isSelected
    ? 'rgba(45, 20, 5, 0.96)'
    : isHovered
    ? 'rgba(30, 20, 10, 0.95)'
    : 'rgba(15, 23, 42, 0.93)';
  ctx.strokeStyle = isDragging || isRotating
    ? '#fef08a'
    : isSelected
    ? '#fbbf24'
    : isHovered
    ? '#fcd34d'
    : '#f59e0b';
  ctx.lineWidth = isDragging || isRotating ? 0.08 : isSelected || isHovered ? 0.06 : 0.045;
  ctx.beginPath();
  ctx.roundRect(-width / 2, -height / 2, width, height, 0.22);
  ctx.fill();
  ctx.stroke();

  // Drag Handle Grip dots on left edge (indicates vertical & horizontal draggability)
  const gripX = -width / 2 + 0.32;
  ctx.fillStyle = isDragging || isRotating || isSelected ? '#fbbf24' : 'rgba(245, 158, 11, 0.75)';
  const dotR = 0.038;
  const dotGap = 0.12;
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 0; col++) {
      ctx.beginPath();
      ctx.arc(gripX + col * dotGap, row * dotGap, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Label Text & Symbol
  ctx.font = 'bold 0.46px "JetBrains Mono", monospace';
  ctx.fillStyle = isDragging || isRotating ? '#ffffff' : isSelected ? '#fef08a' : '#fde68a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0.14, 0.02);

  // 3. Dedicated Maneuver Rotation Handle (rendered when selected, hovered, or actively rotating)
  if (isSelected || isHovered || isRotating || isHoveredRotateHandle) {
    const stemTop = -height / 2 - 0.65;
    const knobRadius = isRotating || isHoveredRotateHandle ? 0.32 : 0.26;

    // Stem line from top edge of badge to rotation knob
    ctx.save();
    ctx.setLineDash([0.14, 0.1]);
    ctx.strokeStyle = isRotating || isHoveredRotateHandle ? '#fde047' : '#f59e0b';
    ctx.lineWidth = isRotating || isHoveredRotateHandle ? 0.06 : 0.045;
    ctx.beginPath();
    ctx.moveTo(0, -height / 2);
    ctx.lineTo(0, stemTop);
    ctx.stroke();
    ctx.restore();

    // Rotation Knob Outer Glow
    if (isRotating || isHoveredRotateHandle) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
      ctx.beginPath();
      ctx.arc(0, stemTop, knobRadius + 0.14, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rotation Knob Circle
    ctx.fillStyle = isRotating || isHoveredRotateHandle ? '#f59e0b' : '#b45309';
    ctx.strokeStyle = isRotating || isHoveredRotateHandle ? '#fef08a' : '#fde68a';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(0, stemTop, knobRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Curved rotation arrow icon inside knob
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, stemTop, knobRadius * 0.55, -Math.PI * 0.8, Math.PI * 0.7);
    ctx.stroke();

    // Arrow tip
    const arrowTipAngle = Math.PI * 0.7;
    const arrowTipR = knobRadius * 0.55;
    const atX = arrowTipR * Math.cos(arrowTipAngle);
    const atY = stemTop + arrowTipR * Math.sin(arrowTipAngle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(atX, atY);
    ctx.lineTo(atX - 0.09, atY - 0.05);
    ctx.lineTo(atX - 0.04, atY + 0.09);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Angle indicator tooltip or drag hint
    if (isRotating) {
      ctx.font = 'bold 0.32px "JetBrains Mono", monospace';
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(rotation)}°`, 0, stemTop - 0.42);
    } else if (isHoveredRotateHandle) {
      ctx.font = 'bold 0.28px "JetBrains Mono", monospace';
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'center';
      ctx.fillText('↻ DRAG TO ROTATE', 0, stemTop - 0.42);
    } else if (isHovered && !isDragging) {
      ctx.font = 'bold 0.26px "JetBrains Mono", monospace';
      ctx.fillStyle = '#67e8f9';
      ctx.textAlign = 'center';
      ctx.fillText('✥ DRAG / ↻ ROTATE', 0, height / 2 + 0.35);
    }
  }

  ctx.restore();
  ctx.restore();
}

function drawSelectionGizmo(
  ctx: CanvasRenderingContext2D,
  item: PlacedItem,
  isHoveredKnob: boolean = false,
  isRotating: boolean = false
) {
  const equip = EQUIPMENT_MAP.get(item.equipId);
  if (!equip) return;

  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate((item.rotation * Math.PI) / 180);

  const maxDim = Math.max(equip.width, equip.depth);
  const ringRadius = maxDim / 2 + 0.65;

  // Dotted selection circle
  ctx.save();
  ctx.setLineDash([0.3, 0.2]);
  ctx.strokeStyle = isRotating ? '#f59e0b' : '#38bdf8';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Degree tick marks on ring (every 45 degrees)
  ctx.setLineDash([]);
  ctx.lineWidth = 0.035;
  for (let deg = 0; deg < 360; deg += 45) {
    const rad = (deg * Math.PI) / 180;
    const isCardinal = deg % 90 === 0;
    const tickLen = isCardinal ? 0.22 : 0.12;
    ctx.strokeStyle = isCardinal ? 'rgba(56, 189, 248, 0.7)' : 'rgba(148, 163, 184, 0.35)';
    ctx.beginPath();
    ctx.moveTo(Math.sin(rad) * (ringRadius - tickLen), -Math.cos(rad) * (ringRadius - tickLen));
    ctx.lineTo(Math.sin(rad) * ringRadius, -Math.cos(rad) * ringRadius);
    ctx.stroke();
  }
  ctx.restore();

  // Forward heading arrow indicating entry flight direction
  ctx.save();
  ctx.strokeStyle = '#f59e0b';
  ctx.fillStyle = '#f59e0b';
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -ringRadius);
  ctx.stroke();
  // Arrow head
  ctx.beginPath();
  ctx.moveTo(0, -ringRadius);
  ctx.lineTo(-0.25, -ringRadius + 0.35);
  ctx.lineTo(0.25, -ringRadius + 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Rotation Handle stem extending upward
  const handleStemLen = ringRadius + 1.15;
  ctx.strokeStyle = isRotating || isHoveredKnob ? '#f59e0b' : '#38bdf8';
  ctx.lineWidth = isRotating || isHoveredKnob ? 0.09 : 0.07;
  ctx.beginPath();
  ctx.moveTo(0, -ringRadius);
  ctx.lineTo(0, -handleStemLen);
  ctx.stroke();

  // Rotation Handle Knob (interactive target for mouse rotation)
  const knobRadius = isRotating || isHoveredKnob ? 0.52 : 0.44;
  ctx.fillStyle = isRotating || isHoveredKnob ? '#f59e0b' : '#0284c7';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.arc(0, -handleStemLen, knobRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Circular arrow rotation icon in knob
  ctx.strokeStyle = isRotating || isHoveredKnob ? '#0f172a' : '#ffffff';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(0, -handleStemLen, knobRadius * 0.52, -Math.PI * 0.7, Math.PI * 0.7);
  ctx.stroke();

  // Angle degrees readout tag (Yaw, Pitch, Roll)
  ctx.save();
  ctx.font = 'bold 0.6px "JetBrains Mono", monospace';
  ctx.fillStyle = isRotating || isHoveredKnob ? '#fef08a' : '#e0f2fe';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let degText = `YAW ${Math.round(item.rotation)}°`;
  const parts: string[] = [degText];
  if (item.pitch) parts.push(`PITCH ${item.pitch > 0 ? '+' : ''}${Math.round(item.pitch)}°`);
  if (item.roll) parts.push(`ROLL ${item.roll > 0 ? '+' : ''}${Math.round(item.roll)}°`);
  ctx.fillText(parts.join(' · '), 0, -handleStemLen - 0.75);
  ctx.restore();

  ctx.restore();
}

function drawPlacingGhost(
  ctx: CanvasRenderingContext2D,
  equipId: string,
  placementYaw: number,
  cursorWorld: { x: number; y: number }
) {
  const equip = EQUIPMENT_MAP.get(equipId);
  if (!equip) return;

  ctx.save();
  ctx.translate(cursorWorld.x, cursorWorld.y);
  ctx.rotate((placementYaw * Math.PI) / 180);
  ctx.globalAlpha = 0.7;

  const w = equip.width;
  const d = equip.depth;

  // Dashed outline
  ctx.setLineDash([0.2, 0.15]);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 0.08;
  ctx.strokeRect(-w / 2, -d / 2, w, d);

  // Fill
  ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.fillRect(-w / 2, -d / 2, w, d);

  // Forward heading arrow
  ctx.setLineDash([]);
  ctx.strokeStyle = '#f59e0b';
  ctx.fillStyle = '#f59e0b';
  ctx.lineWidth = 0.08;
  const topY = -Math.max(w, d) / 2 - 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, topY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, topY);
  ctx.lineTo(-0.25, topY + 0.35);
  ctx.lineTo(0.25, topY + 0.35);
  ctx.closePath();
  ctx.fill();

  // Floating Yaw Text Badge
  ctx.save();
  ctx.font = 'bold 0.65px "JetBrains Mono", monospace';
  ctx.fillStyle = '#fef08a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`YAW: ${Math.round(placementYaw)}°`, 0, topY - 0.25);
  ctx.font = '0.45px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`(Press R / Scroll Wheel to Rotate)`, 0, topY - 1.0);
  ctx.restore();

  ctx.restore();
}

function drawRulerLabels(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportTransform,
  fieldW: number,
  fieldH: number
) {
  const { scale, offsetX, offsetY } = viewport;

  ctx.save();
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Top X Rulers (every 5m and 10m)
  for (let x = 0; x <= fieldW; x += 5) {
    const screenX = offsetX + x * scale;
    const screenY = offsetY - 18;
    if (screenX >= 0 && screenX <= ctx.canvas.width) {
      // tick mark
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(screenX, offsetY - 5);
      ctx.lineTo(screenX, offsetY);
      ctx.stroke();

      ctx.fillText(`${x}m`, screenX, screenY);
    }
  }

  // Left Y Rulers
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let y = 0; y <= fieldH; y += 5) {
    const screenX = offsetX - 10;
    const screenY = offsetY + y * scale;
    if (screenY >= 0 && screenY <= ctx.canvas.height) {
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(offsetX - 5, screenY);
      ctx.lineTo(offsetX, screenY);
      ctx.stroke();

      ctx.fillText(`${y}m`, screenX, screenY);
    }
  }

  ctx.restore();
}
