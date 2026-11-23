import { MAIN_UAE_FPV_TRACK } from '../data/defaultLayouts';
// Grounds (venues): each has a name and field size, and its own autosaved layout.

export interface Ground {
  id: string;
  name: string;
  width: number; // metres
  height: number; // metres (length on the map's vertical axis)
}

export const DEFAULT_GROUND: Ground = { id: 'default', name: 'The Training Grounds', width: 57, height: 43 };
/** The UAE FPV Community's main site: the ground a first-time user opens on (layout in src/data). */
export const MAIN_UAE_GROUND: Ground = { id: 'main-uae-fpv', name: 'Main UAE FPV', width: 200, height: 260 };
export const MIN_GROUND_M = 15;
export const MAX_GROUND_M = 300;

const LIST_KEY = 'training_grounds_grounds_v1';
const ACTIVE_KEY = 'training_grounds_active_ground';
// Set once Main UAE FPV has been offered, so a user who deletes it doesn't get it back
const MAIN_SEEDED_KEY = 'training_grounds_main_uae_seeded';

function isGround(g: any): g is Ground {
  return (
    g &&
    typeof g.id === 'string' &&
    typeof g.name === 'string' &&
    Number.isFinite(g.width) &&
    Number.isFinite(g.height) &&
    g.width >= MIN_GROUND_M &&
    g.height >= MIN_GROUND_M
  );
}

export function loadGrounds(): Ground[] {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const valid: Ground[] = Array.isArray(list) ? list.filter(isGround) : [];
    // The original field always exists
    if (!valid.some((g) => g.id === DEFAULT_GROUND.id)) valid.unshift(DEFAULT_GROUND);
    // Main UAE FPV is added once, next to it (not if this device already has its own copy of that site)
    if (!localStorage.getItem(MAIN_SEEDED_KEY)) {
      localStorage.setItem(MAIN_SEEDED_KEY, '1');
      const hasCopy = valid.some(
        (g) => g.id === MAIN_UAE_GROUND.id || (g.name === MAIN_UAE_GROUND.name && g.width === MAIN_UAE_GROUND.width && g.height === MAIN_UAE_GROUND.height)
      );
      if (!hasCopy) {
        valid.splice(1, 0, MAIN_UAE_GROUND);
        saveGrounds(valid);
      }
    }
    return valid;
  } catch {
    return [DEFAULT_GROUND];
  }
}

export function saveGrounds(list: Ground[]): void {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {}
}

export function loadActiveGroundId(list: Ground[]): string {
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (id && list.some((g) => g.id === id)) return id;
    // First open (nothing chosen yet): start on Main UAE FPV
    if (!id && list.some((g) => g.id === MAIN_UAE_GROUND.id)) return MAIN_UAE_GROUND.id;
  } catch {}
  return DEFAULT_GROUND.id;
}

export function saveActiveGroundId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {}
}

export function newGroundId(): string {
  return `ground-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** A built-in ground's own layout, used until the user has saved one of their own there. */
export function builtInLayout(groundId: string) {
  return groundId === MAIN_UAE_GROUND.id ? MAIN_UAE_FPV_TRACK : null;
}
