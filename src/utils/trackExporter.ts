import { PlacedItem, SavedTrack, TrackGround, TrackMetrics, TrackPoint } from '../types';
import {
  ACTIVE_GROUND_NAME,
  EQUIPMENT_MAP,
  FIELD_HEIGHT_M,
  FIELD_WIDTH_M,
  PERIMETER_FENCE_M,
} from '../constants/equipment';
import { calculatePathAndMetrics, calculateDrawnPathMetrics } from './trackMath';
import { drawFieldScene, ViewportTransform } from './canvasRenderer';
import { saveFile } from './fileSaver';

export async function exportTrackToPNG(
  trackName: string,
  items: PlacedItem[],
  closeLoop: boolean,
  droneSpeedKmH: number,
  drawnPath?: TrackPoint[]
): Promise<void> {
  const { segments, metrics: baseMetrics } = calculatePathAndMetrics(items, closeLoop, droneSpeedKmH);
  const metrics =
    drawnPath && drawnPath.length >= 2
      ? calculateDrawnPathMetrics(drawnPath, items, droneSpeedKmH)
      : baseMetrics;

  // We create a high-res offscreen canvas
  // 57m x 43m with 40 pixels per meter = 2280 x 1720 px + margins for header & telemetry footer
  const ppm = 36; // pixels per meter
  const marginX = 80;
  const marginTop = 120;
  const marginBottom = 120;
  const fieldCanvasW = FIELD_WIDTH_M * ppm;
  const fieldCanvasH = FIELD_HEIGHT_M * ppm;
  const totalW = fieldCanvasW + marginX * 2;
  const totalH = fieldCanvasH + marginTop + marginBottom;

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, totalW, totalH);

  // Header Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 32px "Chakra Petch", "JetBrains Mono", sans-serif';
  ctx.fillText(ACTIVE_GROUND_NAME.toUpperCase(), marginX, 55);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillText(`TRACK LAYOUT: ${trackName.toUpperCase()}`, marginX, 85);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(
    `FIELD: ${FIELD_WIDTH_M.toFixed(1)}m × ${FIELD_HEIGHT_M.toFixed(1)}m | ${PERIMETER_FENCE_M}m PERIMETER FENCE`,
    totalW - marginX,
    55
  );
  ctx.fillText(`DATE: ${new Date().toLocaleDateString()} | FPV DRONE SPEED: ${droneSpeedKmH} km/h`, totalW - marginX, 85);
  ctx.textAlign = 'left';

  // Draw the field scene directly onto the high-res canvas
  const viewport: ViewportTransform = {
    scale: ppm,
    offsetX: marginX,
    offsetY: marginTop,
  };

  drawFieldScene({
    ctx,
    canvasWidth: totalW,
    canvasHeight: totalH,
    viewport,
    items,
    selectedItemId: null,
    hoveredItemId: null,
    isRotating: false,
    closeLoop,
    pathSegments: segments,
    drawnPath: drawnPath || [],
  });

  // Footer: Telemetry Metrics & Legend
  const footerY = marginTop + fieldCanvasH + 30;

  // Telemetry Box
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(marginX, footerY, 540, 70, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillText('TRACK LENGTH', marginX + 20, footerY + 28);
  ctx.fillText('WAYPOINTS', marginX + 160, footerY + 28);
  ctx.fillText('EST. LAP TIME', marginX + 270, footerY + 28);
  ctx.fillText('LONGEST RUN', marginX + 410, footerY + 28);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 22px "JetBrains Mono", monospace';
  ctx.fillText(`${metrics.totalDistance.toFixed(1)}m`, marginX + 20, footerY + 54);

  ctx.fillStyle = '#f8fafc';
  ctx.fillText(`${metrics.gateCount}`, marginX + 160, footerY + 54);

  ctx.fillStyle = '#10b981';
  ctx.fillText(`${metrics.estimatedLapTime.toFixed(1)}s`, marginX + 270, footerY + 54);

  ctx.fillStyle = '#fb923c';
  ctx.fillText(`${metrics.longestStraight.toFixed(1)}m`, marginX + 410, footerY + 54);

  // Equipment count summary on bottom right
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '13px "JetBrains Mono", monospace';
  const equipmentUsed = items.length;
  ctx.fillText(`EQUIPMENT DEPLOYED: ${equipmentUsed} UNITS`, totalW - marginX, footerY + 32);
  ctx.fillStyle = '#64748b';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillText('DESIGNED WITH THE TRAINING GROUNDS FPV TRACK DESIGNER', totalW - marginX, footerY + 54);

  // Download / share the image
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not render the track image');
  const cleanName = trackName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await saveFile(blob, `training-grounds-${cleanName || 'track'}.png`);
}

export async function exportTrackToJSON(
  trackName: string,
  items: PlacedItem[],
  closeLoop: boolean,
  droneSpeedKmH: number,
  drawnPath?: TrackPoint[],
  ground?: TrackGround
): Promise<void> {
  const data: SavedTrack = {
    id: `track-${Date.now()}`,
    name: trackName,
    date: new Date().toISOString(),
    items,
    closeLoop,
    droneSpeedKmH,
    drawnPath: drawnPath && drawnPath.length > 0 ? drawnPath : undefined,
    ground,
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const cleanName = trackName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await saveFile(blob, `training-grounds-${cleanName || 'track'}.json`);
}

export async function parseUploadedTrackJSON(file: File): Promise<SavedTrack> {
  return parseTrackText(await file.text(), file.name);
}

/** Parse the text of a Training Grounds track file (.json). */
export function parseTrackText(text: string, fileName = 'track.json'): SavedTrack {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This is not a Training Grounds track file (.json)');
  }
  if (!data || !Array.isArray(data.items)) {
    throw new Error('Invalid track format: missing items array');
  }
  return {
    id: data.id || `track-${Date.now()}`,
    name: data.name || fileName.replace(/\.json(\.txt)?$/i, ''),
    date: data.date || new Date().toISOString(),
    items: data.items,
    closeLoop: data.closeLoop ?? true,
    droneSpeedKmH: data.droneSpeedKmH ?? 85,
    drawnPath: Array.isArray(data.drawnPath) ? data.drawnPath : undefined,
    ground: parseGround(data.ground),
  };
}

function parseGround(g: any): TrackGround | undefined {
  if (!g || !Number.isFinite(g.width) || !Number.isFinite(g.height)) return undefined;
  if (g.width < 15 || g.height < 15 || g.width > 300 || g.height > 300) return undefined;
  return {
    name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : `${g.width} × ${g.height} m field`,
    width: g.width,
    height: g.height,
  };
}

const STORAGE_KEY = 'training_grounds_saved_tracks';

export function getStoredTracks(): SavedTrack[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveTrackToLocalStorage(track: SavedTrack): void {
  try {
    const current = getStoredTracks();
    const existingIdx = current.findIndex((t) => t.id === track.id || t.name === track.name);
    let updated: SavedTrack[];
    if (existingIdx >= 0) {
      updated = [...current];
      updated[existingIdx] = track;
    } else {
      updated = [track, ...current];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save track to local storage', err);
  }
}

export function deleteTrackFromLocalStorage(trackId: string): void {
  try {
    const current = getStoredTracks();
    const updated = current.filter((t) => t.id !== trackId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to delete track', err);
  }
}
