import { PlacedItem, TrackPoint } from '../types';

export interface PresetTrack {
  id: string;
  name: string;
  description: string;
  items: PlacedItem[];
  closeLoop: boolean;
  droneSpeedKmH: number;
  drawnPath?: TrackPoint[];
}

export const PRESET_TRACKS: PresetTrack[] = [
  {
    id: 'championship-qualifier',
    name: 'Championship Qualifier (Standard)',
    description: 'Dynamic layout with a high-speed triple gate straight, split-S dive, and technical flag slalom.',
    closeLoop: true,
    droneSpeedKmH: 85,
    items: [
      // 1: Start gate (Single 2.5m)
      { id: 'p1', equipId: 'single-2.5', x: 10, y: 35, rotation: 0, sequenceOrder: 1 },
      // 2: 1.5m Gate
      { id: 'p2', equipId: 'single-1.5', x: 20, y: 35, rotation: 0, sequenceOrder: 2 },
      // 3: 3m Flag
      { id: 'p3', equipId: 'flag-3m', x: 30, y: 36, rotation: 0, sequenceOrder: 3 },
      // 4: Double Gate
      { id: 'p4', equipId: 'double-2x2', x: 42, y: 32, rotation: 315, sequenceOrder: 4 },
      // 5: 3m Flag corner
      { id: 'p5', equipId: 'flag-3m', x: 48, y: 22, rotation: 0, sequenceOrder: 5 },
      // 6: Triple Gate (monumental straight)
      { id: 'p6', equipId: 'triple-6x2', x: 38, y: 12, rotation: 180, sequenceOrder: 6 },
      // 7: Cube Gate
      { id: 'p7', equipId: 'cube-2x2', x: 24, y: 10, rotation: 180, sequenceOrder: 7 },
      // 8: Double Cube
      { id: 'p8', equipId: 'double-cube-4x2', x: 12, y: 14, rotation: 135, sequenceOrder: 8 },
      // 9: Slalom Flag
      { id: 'p9', equipId: 'flag-3m', x: 14, y: 24, rotation: 0, sequenceOrder: 9 },
    ],
  },
  {
    id: 'slalom-sweeper',
    name: 'High-Speed Sweeper & Slalom',
    description: 'Smooth flowing rhythm track utilizing wide gates, double gates, and high-G sweeping turns.',
    closeLoop: true,
    droneSpeedKmH: 95,
    items: [
      { id: 's1', equipId: 'single-2.5', x: 12, y: 34, rotation: 345, sequenceOrder: 1 },
      { id: 's2', equipId: 'single-2.5', x: 24, y: 36, rotation: 0, sequenceOrder: 2 },
      { id: 's3', equipId: 'double-2x2', x: 36, y: 35, rotation: 15, sequenceOrder: 3 },
      { id: 's4', equipId: 'flag-3m', x: 46, y: 28, rotation: 0, sequenceOrder: 4 },
      { id: 's5', equipId: 'single-1.5', x: 44, y: 16, rotation: 270, sequenceOrder: 5 },
      { id: 's6', equipId: 'flag-3m', x: 32, y: 12, rotation: 0, sequenceOrder: 6 },
      { id: 's7', equipId: 'double-2x2', x: 20, y: 14, rotation: 240, sequenceOrder: 7 },
      { id: 's8', equipId: 'single-1.5', x: 8, y: 22, rotation: 90, sequenceOrder: 8 },
    ],
  },
  {
    id: 'speed-tunnel-test',
    name: 'Precision Cube & Technical Loop',
    description: 'Tight technical testing for precision piloting through cube tunnels and vertical elevation changes.',
    closeLoop: true,
    droneSpeedKmH: 70,
    items: [
      { id: 't1', equipId: 'single-1.5', x: 14, y: 32, rotation: 0, sequenceOrder: 1 },
      { id: 't2', equipId: 'cube-2x2', x: 26, y: 32, rotation: 0, sequenceOrder: 2 },
      { id: 't3', equipId: 'flag-3m', x: 38, y: 34, rotation: 0, sequenceOrder: 3 },
      { id: 't4', equipId: 'double-cube-4x2', x: 44, y: 22, rotation: 270, sequenceOrder: 4 },
      { id: 't5', equipId: 'flag-3m', x: 38, y: 10, rotation: 0, sequenceOrder: 5 },
      { id: 't6', equipId: 'triple-6x2', x: 26, y: 12, rotation: 180, sequenceOrder: 6 },
      { id: 't7', equipId: 'double-2x2', x: 14, y: 16, rotation: 135, sequenceOrder: 7 },
    ],
  },
];
