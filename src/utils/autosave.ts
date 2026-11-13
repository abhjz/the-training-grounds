import { PlacedItem, TrackPoint } from '../types';

// Autosave of the current working layout, so a refresh or closed tab doesn't lose work.
// Separate from the named tracks the user saves through the Save/Load modal.

const AUTOSAVE_KEY = 'training_grounds_autosave_v1';

// The original ground keeps the original key, so existing autosaves carry over
const keyFor = (groundId: string) => (groundId === 'default' ? AUTOSAVE_KEY : `${AUTOSAVE_KEY}:${groundId}`);

export interface AutosaveState {
  items: PlacedItem[];
  drawnPath: TrackPoint[];
  closeLoop: boolean;
  closeDrawnLoop: boolean;
  droneSpeedKmH: number;
  snapGrid: number;
  showDistances: boolean;
  drawnPathColor: string;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isValidItem(v: any): v is PlacedItem {
  return (
    v &&
    typeof v.id === 'string' &&
    typeof v.equipId === 'string' &&
    isFiniteNumber(v.x) &&
    isFiniteNumber(v.y) &&
    isFiniteNumber(v.rotation)
  );
}

function isValidPoint(v: any): v is TrackPoint {
  return v && isFiniteNumber(v.x) && isFiniteNumber(v.y);
}

/** Returns the last autosaved layout, or null if there is none or it is unreadable. */
export function loadAutosave(groundId = 'default'): AutosaveState | null {
  try {
    const raw = localStorage.getItem(keyFor(groundId));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.items) || !d.items.every(isValidItem)) return null;
    const drawnPath = Array.isArray(d.drawnPath) ? d.drawnPath.filter(isValidPoint) : [];
    return {
      items: d.items.map((it: PlacedItem) => ({ ...it, sequenceOrder: it.sequenceOrder ?? null })),
      drawnPath,
      closeLoop: typeof d.closeLoop === 'boolean' ? d.closeLoop : true,
      closeDrawnLoop: typeof d.closeDrawnLoop === 'boolean' ? d.closeDrawnLoop : false,
      droneSpeedKmH: isFiniteNumber(d.droneSpeedKmH) ? d.droneSpeedKmH : 85,
      snapGrid: isFiniteNumber(d.snapGrid) ? d.snapGrid : 0.5,
      showDistances: typeof d.showDistances === 'boolean' ? d.showDistances : true,
      drawnPathColor: typeof d.drawnPathColor === 'string' ? d.drawnPathColor : '#ef4444',
    };
  } catch {
    return null;
  }
}

export function writeAutosave(state: AutosaveState, groundId = 'default'): void {
  try {
    localStorage.setItem(keyFor(groundId), JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode) — autosave is best-effort.
  }
}

export function deleteAutosave(groundId: string): void {
  try {
    localStorage.removeItem(keyFor(groundId));
  } catch {}
}
