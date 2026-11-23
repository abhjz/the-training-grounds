import { EquipmentDef, EquipmentVisualType, PlacedItem } from '../types';

/**
 * Site pieces: the ground surfaces, terrain, trees, buildings and props of a real flying site,
 * so a whole field (not just the gates) can be modelled. Added to the inventory under "Site & scenery".
 */

/** Flat ground surfaces: drawn under everything, never catch clicks in 3D, clicked last in 2D. */
export const GROUND_COVER_TYPES = new Set<EquipmentVisualType>([
  'turf_pitch',
  'sand_pit',
  'asphalt',
  'gravel_road',
  'dirt_lane',
  'dirt_curve',
  'dirt_area',
  'grass',
]);
/** Low terrain: drawn above the surfaces but under gates and objects. */
const TERRAIN_TYPES = new Set<EquipmentVisualType>(['scrub_patch', 'berm']);

/** 0 = ground surface, 1 = low terrain, 2 = everything else. */
export function layerOfType(t: EquipmentVisualType | undefined): number {
  if (!t) return 2;
  if (GROUND_COVER_TYPES.has(t)) return 0;
  if (TERRAIN_TYPES.has(t)) return 1;
  return 2;
}

type SiteDef = Omit<EquipmentDef, 'totalStock' | 'glowColor' | 'isGate' | 'category'> & { isGate?: boolean; glowColor?: string };

const site = (d: SiteDef): EquipmentDef => ({
  totalStock: 9999,
  glowColor: 'rgba(148, 163, 184, 0.35)',
  isGate: false,
  category: 'site',
  resizable: true, // every extra element can be sized per copy (width, length, height)
  ...d,
});

export const SITE_EQUIPMENT: EquipmentDef[] = [
  // ---- ground surfaces
  site({ id: 'turf-pitch', name: 'Turf Pitch (fenced)', shortName: 'Turf Pitch', width: 85, depth: 65, tierHeight: 4, heightDesc: '85 × 65 m · 4 m net fence', visualType: 'turf_pitch', color: '#2E7D1F', borderColor: '#4ade80', description: 'Artificial-turf pitch with a green net fence all round. Resize it to your pitch.', resizable: true }),
  site({ id: 'sand-pit', name: 'Sand Pit (fenced)', shortName: 'Sand Pit', width: 70, depth: 27, tierHeight: 1.5, heightDesc: '70 × 27 m · low wall', visualType: 'sand_pit', color: '#B9A88E', borderColor: '#d6c7ad', description: 'Fenced sand area with a low concrete edge.', resizable: true }),
  site({ id: 'asphalt-apron', name: 'Asphalt Apron / Parking', shortName: 'Asphalt', width: 38, depth: 70, tierHeight: 0.02, heightDesc: '38 × 70 m', visualType: 'asphalt', color: '#4B4A48', borderColor: '#78716c', description: 'Dark asphalt area for parking and pits.', resizable: true }),
  site({ id: 'gravel-road', name: 'Gravel Road', shortName: 'Gravel Road', width: 6.7, depth: 100, tierHeight: 0.02, heightDesc: '6.7 m wide · 100 m', visualType: 'gravel_road', color: '#8E8478', borderColor: '#a8a29e', description: 'Straight gravel road. Set its length in the item settings.', resizable: true }),
  site({ id: 'dirt-lane', name: 'Dirt Track – Straight', shortName: 'Dirt Straight', width: 8, depth: 20, tierHeight: 0.02, heightDesc: '8 m wide · 20 m', visualType: 'dirt_lane', color: '#C9BBA3', borderColor: '#e7dcc8', description: 'Straight piece of cleared dirt track with tyre ruts.', resizable: true }),
  site({ id: 'dirt-curve', name: 'Dirt Track – 90° Curve', shortName: 'Dirt Curve', width: 8, depth: 14, tierHeight: 0.02, heightDesc: '8 m wide · 14 m radius', visualType: 'dirt_curve', color: '#C9BBA3', borderColor: '#e7dcc8', description: 'Quarter-circle piece of dirt track. Width = track width, Length = turn radius.', resizable: true }),
  site({ id: 'dirt-area', name: 'Cleared Dirt Area', shortName: 'Dirt Area', width: 30, depth: 30, tierHeight: 0.02, heightDesc: '30 × 30 m', visualType: 'dirt_area', color: '#C2B49C', borderColor: '#e7dcc8', description: 'Open, flattened sand with tyre marks.', resizable: true }),
  // ---- terrain
  site({ id: 'scrub-patch', name: 'Desert Scrub Patch', shortName: 'Scrub', width: 20, depth: 20, tierHeight: 1.2, heightDesc: '20 × 20 m of bushes', visualType: 'scrub_patch', color: '#4A4A33', borderColor: '#84845c', description: 'Low desert bushes scattered over an area.', resizable: true }),
  site({ id: 'sand-berm', name: 'Sand Berm', shortName: 'Berm', width: 3, depth: 20, tierHeight: 1.2, heightDesc: '3 m wide · 1.2 m high', visualType: 'berm', color: '#A8997F', borderColor: '#cfc0a4', description: 'Raised sand bank along a track edge.', resizable: true }),
  // ---- trees and grass
  site({ id: 'grass-patch', name: 'Grass Patch', shortName: 'Grass', width: 20, depth: 20, tierHeight: 0.3, heightDesc: '20 × 20 m', visualType: 'grass', color: '#5E7D3A', borderColor: '#86b45a', description: 'Natural grass with small tufts. Set its width and length to fit.', resizable: true }),
  site({ id: 'tree-ghaf', name: 'Big Tree (Ghaf)', shortName: 'Big Tree', width: 16, depth: 16, tierHeight: 9, heightDesc: '16 m crown · 9 m', visualType: 'tree_big', color: '#2F4A22', borderColor: '#4d7c3a', description: 'Large dark-green desert tree with a wide crown.' }),
  site({ id: 'tree-small', name: 'Small Tree / Bush', shortName: 'Small Tree', width: 5, depth: 5, tierHeight: 4.5, heightDesc: '5 m crown · 4.5 m', visualType: 'tree_small', color: '#4F5A33', borderColor: '#7a8a4e', description: 'Small desert tree, like the row beside the sand pit.' }),
  site({ id: 'palm-tree', name: 'Palm Tree', shortName: 'Palm', width: 5, depth: 5, tierHeight: 9, heightDesc: '9 m', visualType: 'palm', color: '#4F6B2E', borderColor: '#7da34a', description: 'Date palm.' }),
  // ---- buildings and shelters
  site({ id: 'building-white', name: 'White Building', shortName: 'Building', width: 22, depth: 28, tierHeight: 4.5, heightDesc: '22 × 28 m · 4.5 m', visualType: 'building', color: '#E8E6E1', borderColor: '#f5f5f4', description: 'Low white flat-roof building. Resize it to match.', resizable: true }),
  site({ id: 'portable-cabin', name: 'Portable Cabin', shortName: 'Cabin', width: 6, depth: 2.4, tierHeight: 2.6, heightDesc: '6 × 2.4 m', visualType: 'cabin', color: '#F1F1EE', borderColor: '#ffffff', description: 'White site cabin.' }),
  site({ id: 'shade-shed', name: 'Long Shade Shed', shortName: 'Shade Shed', width: 7, depth: 22, tierHeight: 3.5, heightDesc: '7 × 22 m roof', visualType: 'shade_shed', color: '#B8BCC0', borderColor: '#d4d7da', description: 'Grey metal roof on posts.', resizable: true }),
  site({ id: 'open-shelter', name: 'Open Shelter (pilot box)', shortName: 'Open Shelter', width: 12, depth: 6.5, tierHeight: 3, heightDesc: '12 × 6.5 m', visualType: 'open_shelter', color: '#C9CDD1', borderColor: '#e5e7eb', description: 'Flat-roof shelter, open at the front: a spectator or pilot box.', resizable: true }),
  site({ id: 'gazebo-pink', name: 'Gazebo (pink roof)', shortName: 'Pink Gazebo', width: 3, depth: 3, tierHeight: 2.8, heightDesc: '3 × 3 m', visualType: 'gazebo', color: '#E879A6', borderColor: '#f9a8d4', description: 'Pop-up gazebo with a pink roof.' }),
  site({ id: 'gazebo-green', name: 'Shade Tent (green)', shortName: 'Green Tent', width: 4, depth: 4, tierHeight: 2.8, heightDesc: '4 × 4 m', visualType: 'gazebo', color: '#3F7D4A', borderColor: '#86efac', description: 'Green shade tent.' }),
  // ---- poles and structures
  site({ id: 'floodlight-pole', name: 'Floodlight Pole', shortName: 'Floodlight', width: 1, depth: 1, tierHeight: 15, heightDesc: '15 m', visualType: 'floodlight', color: '#9CA3AF', borderColor: '#e5e7eb', description: 'Tall pitch floodlight.' }),
  site({ id: 'light-pole', name: 'Track Light Pole', shortName: 'Light Pole', width: 0.6, depth: 0.6, tierHeight: 8, heightDesc: '8 m', visualType: 'light_pole', color: '#6B7280', borderColor: '#d1d5db', description: 'Light pole along the track.' }),
  site({ id: 'telecom-mast', name: 'Lattice Mast (red/white)', shortName: 'Mast', width: 2.5, depth: 2.5, tierHeight: 30, heightDesc: '30 m', visualType: 'mast', color: '#DC2626', borderColor: '#f87171', description: 'Red and white lattice telecom mast.' }),
  // ---- obstacles and props
  site({ id: 'container-20ft-green', name: '20ft Container (green)', shortName: 'Green Container', width: 2.44, depth: 6.06, tierHeight: 2.59, heightDesc: '2.59m H · 6.06m long', visualType: 'container', color: '#3D6B3A', borderColor: '#86efac', description: 'Green 20ft container, open both ends. Raise it 2.59 m to stack it.', isGate: true }),
  site({ id: 'container-20ft-blue', name: '20ft Container (light blue)', shortName: 'Blue Container', width: 2.44, depth: 6.06, tierHeight: 2.59, heightDesc: '2.59m H · 6.06m long', visualType: 'container', color: '#7FA9BF', borderColor: '#bae6fd', description: 'Light-blue 20ft container, open both ends.', isGate: true }),
  site({ id: 'container-40ft-rust', name: '40ft Container (rusty)', shortName: '40ft Container', width: 2.44, depth: 12.19, tierHeight: 2.59, heightDesc: '2.59m H · 12.19m long', visualType: 'container', color: '#8B4A2B', borderColor: '#f59e0b', description: 'Rusty 40ft container, open both ends. Fly through its 12 m length.', isGate: true }),
  site({ id: 'container-20ft-teal', name: '20ft Container (blue-green)', shortName: 'Teal Container', width: 2.44, depth: 6.06, tierHeight: 2.59, heightDesc: '2.59m H · 6.06m long', visualType: 'container', color: '#4E8C84', borderColor: '#5eead4', description: 'Blue-green 20ft container, open both ends.', isGate: true }),
  site({ id: 'jeep-wreck', name: 'Wrecked Jeep Frame', shortName: 'Jeep Wreck', width: 1.8, depth: 3.8, tierHeight: 1.6, heightDesc: '3.8 m long', visualType: 'jeep', color: '#6B5B3E', borderColor: '#a8925f', description: 'Small stripped jeep body and roll frame.' }),
  site({ id: 'flagpole-national', name: 'National Flag on Pole', shortName: 'Flagpole', width: 2, depth: 0.4, tierHeight: 6, heightDesc: '6 m pole · 1.8 × 0.9 m flag', visualType: 'flagpole', color: '#E5E7EB', borderColor: '#f8fafc', description: 'Tall pole with a waving flag. Add the flag image as its logo.' }),
  site({ id: 'vehicle-wreck', name: 'Wrecked Tanker on Trailer', shortName: 'Wreck', width: 3, depth: 10, tierHeight: 3.2, heightDesc: '10 m long · 3.2 m', visualType: 'wreck', color: '#5C5A3A', borderColor: '#a3a36b', description: 'Old olive and rust tank body on a trailer.' }),
  site({ id: 'double-arch-frame', name: 'Double Arch Frame (metal)', shortName: 'Double Arch', width: 6, depth: 1.2, tierHeight: 4.5, heightDesc: '6 m wide · 4.5 m', visualType: 'double_arch', color: '#3A3F44', borderColor: '#9ca3af', description: 'Two dark-metal lattice arches side by side.', isGate: true }),
  site({ id: 'tyre', name: 'Tyre', shortName: 'Tyre', width: 1.2, depth: 1.2, tierHeight: 0.4, heightDesc: 'Ø 1.2 m', visualType: 'tyre', color: '#1F2937', borderColor: '#6b7280', description: 'Old tyre lying on the ground.' }),
  site({ id: 'cable-drum', name: 'Cable Drum', shortName: 'Cable Drum', width: 1.6, depth: 1.2, tierHeight: 1.6, heightDesc: 'Ø 1.6 m', visualType: 'cable_drum', color: '#8B5A2B', borderColor: '#c08a52', description: 'Wooden cable drum standing on its edge.' }),
];

/** The item's real footprint: its own size when it has been resized, otherwise the piece's size. */
export function itemDims(
  item: Pick<PlacedItem, 'sizeW' | 'sizeD' | 'sizeH'>,
  equip: Pick<EquipmentDef, 'width' | 'depth' | 'resizable' | 'tierHeight'> | undefined
) {
  const w = equip?.resizable && item.sizeW ? item.sizeW : equip?.width ?? 1;
  const d = equip?.resizable && item.sizeD ? item.sizeD : equip?.depth ?? 1;
  const h = equip?.resizable && item.sizeH ? item.sizeH : equip?.tierHeight;
  return { w, d, h };
}
