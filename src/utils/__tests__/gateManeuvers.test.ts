import { describe, expect, it } from 'vitest';
import { gateManeuverPoints } from '../trackMath';
import { MANEUVER_OPTIONS } from '../../types';
import type { PlacedItem, TrackPoint } from '../../types';

const gate = (over: Partial<PlacedItem> = {}): PlacedItem => ({
  id: 'g',
  equipId: 'single-2.5',
  x: 28,
  y: 21,
  rotation: 0,
  sequenceOrder: 1,
  ...over,
});

const zs = (pts: TrackPoint[]) => pts.map((p) => p.z ?? 0);
const throughCentre = (pts: TrackPoint[], g: PlacedItem) =>
  pts.find((p) => Math.abs(p.x - g.x) < 0.01 && Math.abs(p.y - g.y) < 0.01);

describe('gateManeuverPoints', () => {
  it('flies straight through the middle of a single gate by default', () => {
    const g = gate();
    const pts = gateManeuverPoints(g);
    expect(pts).toHaveLength(3);
    expect(throughCentre(pts, g)).toBeDefined();
    expect(new Set(zs(pts)).size).toBe(1);
  });

  it('every maneuver in the menu gives a valid path that crosses the gate', () => {
    for (const opt of MANEUVER_OPTIONS) {
      const g = gate({ maneuver: opt.id });
      const pts = gateManeuverPoints(g);
      expect(pts.length, opt.id).toBeGreaterThanOrEqual(3);
      for (const p of pts) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), opt.id).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
      }
      expect(throughCentre(pts, g), opt.id).toBeDefined();
    }
  });

  it('picks the right opening of a triple gate', () => {
    const low = Math.max(...zs(gateManeuverPoints(gate({ equipId: 'triple-6x2', targetTier: 'tier1' }))));
    const mid = Math.max(...zs(gateManeuverPoints(gate({ equipId: 'triple-6x2', targetTier: 'tier2' }))));
    const top = Math.max(...zs(gateManeuverPoints(gate({ equipId: 'triple-6x2', targetTier: 'tier3' }))));
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(top);
  });

  it('a ladder passes through every opening, bottom to top', () => {
    const pts = gateManeuverPoints(gate({ equipId: 'triple-6x2', targetTier: 'ladder_up' }));
    const g = gate();
    const passes = pts.filter((p) => Math.abs(p.x - g.x) < 0.01 && Math.abs(p.y - g.y) < 0.01).map((p) => p.z ?? 0);
    expect(passes).toHaveLength(3);
    expect(passes[0]).toBeLessThan(passes[1]);
    expect(passes[1]).toBeLessThan(passes[2]);
  });

  it('dive in starts high and ends at the opening', () => {
    const pts = gateManeuverPoints(gate({ maneuver: 'dive_in' }));
    expect(pts[0].z!).toBeGreaterThan(pts[pts.length - 1].z! + 2);
  });

  it('dive out is the mirror of dive in', () => {
    const pts = gateManeuverPoints(gate({ maneuver: 'dive_out' }));
    expect(pts[pts.length - 1].z!).toBeGreaterThan(pts[0].z! + 2);
  });

  it('split-S goes over the top of the gate first', () => {
    const pts = gateManeuverPoints(gate({ maneuver: 'split_s' }));
    expect(pts[0].z!).toBeGreaterThan(pts[pts.length - 1].z!);
  });

  it('the double cube dives in through the top by default', () => {
    const pts = gateManeuverPoints(gate({ equipId: 'double-cube-4x2' }));
    expect(pts[0].z!).toBeGreaterThan(pts[pts.length - 1].z!);
  });

  it('reverse builds the same maneuver flown the other way', () => {
    const g = gate({ maneuver: 'dive_in' });
    const fwd = gateManeuverPoints(g);
    const rev = gateManeuverPoints(g, true);
    // Starts on the opposite side of the gate
    expect(Math.sign(fwd[0].y - g.y)).toBe(-Math.sign(rev[0].y - g.y));
  });

  it('stays inside the field near an edge', () => {
    const pts = gateManeuverPoints(gate({ x: 0.5, y: 0.5, maneuver: 'orbit_pole_left_exit' }));
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });
});
