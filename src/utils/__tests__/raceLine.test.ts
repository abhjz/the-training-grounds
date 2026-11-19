import { describe, expect, it } from 'vitest';
import { controlsToPath, pathToControls, shapeForGate, RaceLineControls, DEFAULT_LINE_ALT } from '../raceLine';
import type { PlacedItem, TrackPoint } from '../../types';

const ctrlOpen: RaceLineControls = {
  closed: false,
  points: [
    { x: 5, y: 5, z: 1.2 },
    { x: 20, y: 8, z: 2 },
    { x: 35, y: 20, z: 3.5 },
    { x: 30, y: 35, z: 1.5 },
    { x: 10, y: 30, z: 1 },
  ],
};
const ctrlLoop: RaceLineControls = { ...ctrlOpen, closed: true };

const same = (a: TrackPoint[], b: TrackPoint[]) => {
  expect(a.length).toBe(b.length);
  a.forEach((p, i) => {
    expect(p.x).toBeCloseTo(b[i].x, 3);
    expect(p.y).toBeCloseTo(b[i].y, 3);
    expect(p.z ?? DEFAULT_LINE_ALT).toBeCloseTo(b[i].z ?? DEFAULT_LINE_ALT, 3);
  });
};

const gate = (over: Partial<PlacedItem> = {}): PlacedItem => ({
  id: 'g1',
  equipId: 'single-2.5',
  x: 20,
  y: 8,
  rotation: 90,
  sequenceOrder: 1,
  ...over,
});

describe('race line round trip', () => {
  it('keeps every control point of an open line', () => {
    const back = pathToControls(controlsToPath(ctrlOpen), false);
    expect(back.closed).toBe(false);
    same(back.points, ctrlOpen.points);
  });

  it('keeps every control point of a closed loop', () => {
    const back = pathToControls(controlsToPath(ctrlLoop), false);
    expect(back.closed).toBe(true);
    same(back.points, ctrlLoop.points);
  });

  it('survives many edit → save → reopen cycles without drifting', () => {
    let path = controlsToPath(ctrlLoop, '#ff0000');
    for (let i = 0; i < 10; i++) path = controlsToPath(pathToControls(path, true), '#ff0000');
    same(pathToControls(path, true).points, ctrlLoop.points);
  });

  it('survives a save/load through JSON', () => {
    const saved = JSON.parse(JSON.stringify(controlsToPath(ctrlOpen)));
    same(pathToControls(saved, false).points, ctrlOpen.points);
  });

  it('passes exactly through each control point and marks them', () => {
    const path = controlsToPath(ctrlOpen);
    const marked = path.filter((p) => p.k === 1);
    same(marked, ctrlOpen.points);
    expect(path.length).toBeGreaterThan(ctrlOpen.points.length * 4);
  });

  it('simplifies an older line with no control marks', () => {
    const dense: TrackPoint[] = Array.from({ length: 200 }, (_, i) => ({ x: 5 + i * 0.2, y: 10, z: 1.2 }));
    const ctrl = pathToControls(dense, false);
    expect(ctrl.points.length).toBeLessThanOrEqual(3);
    expect(ctrl.points[0].x).toBeCloseTo(5);
    expect(ctrl.points[ctrl.points.length - 1].x).toBeCloseTo(44.8);
  });

  it('keeps a stroke drawn by hand added to an edited line', () => {
    const edited = controlsToPath(ctrlOpen);
    const stroke: TrackPoint[] = Array.from({ length: 30 }, (_, i) => ({ x: 10 - i * 0.2, y: 30 + i * 0.3, z: 1 }));
    const ctrl = pathToControls([...edited, ...stroke], false);
    same(ctrl.points.slice(0, ctrlOpen.points.length), ctrlOpen.points);
    expect(ctrl.points.length).toBeGreaterThan(ctrlOpen.points.length);
  });
});

describe('shapeForGate', () => {
  it('returns null when the line is far from the gate', () => {
    expect(shapeForGate(ctrlOpen, gate({ x: 50, y: 40 }))).toBeNull();
  });

  it('lifts the line to the chosen tier of a tall gate', () => {
    const next = shapeForGate(ctrlOpen, gate({ equipId: 'triple-6x2', targetTier: 'tier3' }));
    expect(next).not.toBeNull();
    const nearGate = next!.points.filter((p) => Math.hypot(p.x - 20, p.y - 8) < 1);
    expect(Math.max(...nearGate.map((p) => p.z ?? 0))).toBeGreaterThan(4);
  });

  it('reshapes a gate crossed in the middle of a segment', () => {
    const line: RaceLineControls = { closed: false, points: [{ x: 5, y: 20, z: 1.2 }, { x: 45, y: 20, z: 1.2 }] };
    const next = shapeForGate(line, gate({ x: 25, y: 20, maneuver: 'dive_in' }));
    expect(next).not.toBeNull();
    expect(next!.points.length).toBeGreaterThan(2);
    expect(next!.points[0]).toEqual(line.points[0]);
    expect(next!.points[next!.points.length - 1]).toEqual(line.points[1]);
    expect(Math.max(...next!.points.map((p) => p.z ?? 0))).toBeGreaterThan(3);
  });

  it('keeps the rest of the line untouched', () => {
    const next = shapeForGate(ctrlOpen, gate({ maneuver: 'slalom_left' }))!;
    expect(next.points[0]).toEqual(ctrlOpen.points[0]);
    expect(next.points[next.points.length - 1]).toEqual(ctrlOpen.points[ctrlOpen.points.length - 1]);
  });
});
