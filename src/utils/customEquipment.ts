import { EquipmentDef, EquipmentVisualType } from '../types';
import { EQUIPMENT_INVENTORY, EQUIPMENT_MAP } from '../constants/equipment';

// Equipment the user designs in the app. Stored in this browser and shared by every ground.

export type CustomShape = 'gate' | 'gate_pole' | 'stack2' | 'stack3' | 'stack4' | 'flag' | 'cube' | 'cube2';

export interface ShapeInfo {
  label: string;
  visualType: EquipmentVisualType;
  tiers: number;
  defaultWidth: number;
  defaultHeight: number;
  heightLabel: string; // what the height field means for this shape
  depth: (width: number) => number;
}

export const CUSTOM_SHAPES: Record<CustomShape, ShapeInfo> = {
  gate: { label: 'Gate', visualType: 'single_gate_blue', tiers: 1, defaultWidth: 1.5, defaultHeight: 1.5, heightLabel: 'Height', depth: () => 0.4 },
  gate_pole: { label: 'Gate + side pole', visualType: 'single_gate_lightblue', tiers: 1, defaultWidth: 1.5, defaultHeight: 1.5, heightLabel: 'Frame height', depth: () => 0.4 },
  stack2: { label: 'Stacked gate ×2', visualType: 'vertical_double', tiers: 2, defaultWidth: 2, defaultHeight: 2, heightLabel: 'Height of each tier', depth: () => 0.5 },
  stack3: { label: 'Stacked gate ×3', visualType: 'vertical_triple', tiers: 3, defaultWidth: 2, defaultHeight: 2, heightLabel: 'Height of each tier', depth: () => 0.5 },
  stack4: { label: 'Stacked gate ×4', visualType: 'vertical_quad', tiers: 4, defaultWidth: 2, defaultHeight: 2, heightLabel: 'Height of each tier', depth: () => 0.5 },
  flag: { label: 'Flag / pole', visualType: 'flag_pole', tiers: 1, defaultWidth: 0.9, defaultHeight: 3, heightLabel: 'Pole height', depth: (w) => w },
  cube: { label: 'Cube', visualType: 'cube_gate', tiers: 1, defaultWidth: 2, defaultHeight: 2, heightLabel: 'Height', depth: (w) => w },
  cube2: { label: 'Stacked cubes ×2', visualType: 'double_cube', tiers: 2, defaultWidth: 2, defaultHeight: 2, heightLabel: 'Height of each cube', depth: (w) => w },
};

export const CUSTOM_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#f8fafc'];

export interface CustomEquipmentInput {
  name: string;
  shape: CustomShape;
  width: number;
  height: number;
  color: string;
  note?: string;
}

const KEY = 'training_grounds_custom_equipment_v1';

const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function makeCustomDef(input: CustomEquipmentInput, id = `custom-${Date.now().toString(36)}`): EquipmentDef & {
  customShape: CustomShape;
} {
  const info = CUSTOM_SHAPES[input.shape];
  const total = input.height * info.tiers;
  const heightDesc =
    info.tiers > 1 ? `${fmt(total)}m H (${info.tiers}× ${fmt(input.height)}m)` : `${fmt(input.height)}m H`;
  return {
    id,
    name: input.name.trim(),
    shortName: input.name.trim().slice(0, 22),
    width: input.width,
    depth: info.depth(input.width),
    heightDesc,
    totalStock: 9999,
    visualType: info.visualType,
    color: input.color,
    glowColor: hexToRgba(input.color, 0.45),
    borderColor: input.color,
    description: input.note?.trim() || `Custom ${info.label.toLowerCase()} · ${fmt(input.width)}m wide`,
    isGate: true,
    isCustom: true,
    resizable: true,
    tierHeight: input.height,
    customShape: input.shape,
  };
}

function isDef(d: any): d is EquipmentDef {
  return (
    d &&
    typeof d.id === 'string' &&
    d.id.startsWith('custom-') &&
    typeof d.name === 'string' &&
    Number.isFinite(d.width) &&
    typeof d.visualType === 'string'
  );
}

export function loadCustomEquipment(): EquipmentDef[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isDef).map((d) => ({ ...d, isCustom: true })) : [];
  } catch {
    return [];
  }
}

export function saveCustomEquipment(defs: EquipmentDef[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(defs));
  } catch {}
}

/** Make custom pieces part of the shared inventory and lookup used by the map, 3D view and exports. */
export function registerCustomEquipment(defs: EquipmentDef[]): void {
  for (let i = EQUIPMENT_INVENTORY.length - 1; i >= 0; i--) {
    if (EQUIPMENT_INVENTORY[i].isCustom) {
      EQUIPMENT_MAP.delete(EQUIPMENT_INVENTORY[i].id);
      EQUIPMENT_INVENTORY.splice(i, 1);
    }
  }
  for (const d of defs) {
    EQUIPMENT_INVENTORY.push(d);
    EQUIPMENT_MAP.set(d.id, d);
  }
}

/** Grounds (by autosave key) whose saved layout uses this piece. */
export function groundsUsing(equipId: string): number {
  let count = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('training_grounds_autosave_v1')) {
        if ((localStorage.getItem(k) ?? '').includes(`"equipId":"${equipId}"`)) count++;
      }
    }
  } catch {}
  return count;
}
