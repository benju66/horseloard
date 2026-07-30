import { describe, expect, it } from 'vitest';
import { LanePath, buildLanePaths } from './path';
import { MapSchema } from '../data/schemas';
import meadowRoadMapJson from '../data/maps/meadow-road.json';

describe('LanePath', () => {
  // Simple L-shape: 100 right, then 50 up.
  const path = new LanePath([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: -50 },
  ]);

  it('computes total length', () => {
    expect(path.totalLength).toBe(150);
  });

  it('positions at start, mid-segment, corner, and end', () => {
    const out = { x: NaN, y: NaN };
    expect(path.positionAt(0, out)).toEqual({ x: 0, y: 0 });
    expect(path.positionAt(60, out)).toEqual({ x: 60, y: 0 });
    expect(path.positionAt(100, out)).toEqual({ x: 100, y: 0 });
    expect(path.positionAt(125, out)).toEqual({ x: 100, y: -25 });
    expect(path.positionAt(150, out)).toEqual({ x: 100, y: -50 });
  });

  it('clamps out-of-range distances', () => {
    const out = { x: NaN, y: NaN };
    expect(path.positionAt(-5, out)).toEqual({ x: 0, y: 0 });
    expect(path.positionAt(9999, out)).toEqual({ x: 100, y: -50 });
  });

  it('writes into the caller-owned vector (no allocation)', () => {
    const out = { x: 0, y: 0 };
    const result = path.positionAt(60, out);
    expect(result).toBe(out);
  });

  it('skips zero-length segments from duplicate waypoints', () => {
    const p = new LanePath([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(p.totalLength).toBe(10);
    const out = { x: NaN, y: NaN };
    expect(p.positionAt(5, out)).toEqual({ x: 5, y: 0 });
  });

  it('rejects degenerate polylines', () => {
    expect(() => new LanePath([{ x: 1, y: 1 }])).toThrow('at least 2 waypoints');
    expect(
      () =>
        new LanePath([
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ]),
    ).toThrow('zero total length');
  });
});

describe('meadow-road lane (real seed data)', () => {
  const map = MapSchema.parse(meadowRoadMapJson);
  const lanes = buildLanePaths(map);
  const main = lanes.get('main')!;

  it('matches the prototype path length', () => {
    // Same math as the prototype's SEG/PATH_LEN precompute.
    let expected = 0;
    const wp = map.lanes[0]!.waypoints;
    for (let i = 0; i < wp.length - 1; i++) {
      expected += Math.hypot(wp[i + 1]!.x - wp[i]!.x, wp[i + 1]!.y - wp[i]!.y);
    }
    expect(main.totalLength).toBeCloseTo(expected, 9);
    expect(main.totalLength).toBeGreaterThan(1000); // sanity: it's a real map
  });

  it('starts off-screen at the spawn and ends at the gate approach', () => {
    const out = { x: NaN, y: NaN };
    expect(main.positionAt(0, out)).toEqual({ x: 210, y: -50 });
    expect(main.positionAt(main.totalLength, out)).toEqual({ x: 210, y: 690 });
    // 140 units in = exactly the first corner
    expect(main.positionAt(140, out)).toEqual({ x: 210, y: 90 });
  });
});
