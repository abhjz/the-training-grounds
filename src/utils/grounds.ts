// Grounds (venues): each has a name and field size, and its own autosaved layout.

export interface Ground {
  id: string;
  name: string;
  width: number; // metres
  height: number; // metres (length on the map's vertical axis)
}

export const DEFAULT_GROUND: Ground = { id: 'default', name: 'The Training Grounds', width: 57, height: 43 };
export const MIN_GROUND_M = 15;
export const MAX_GROUND_M = 300;

const LIST_KEY = 'training_grounds_grounds_v1';
const ACTIVE_KEY = 'training_grounds_active_ground';

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
