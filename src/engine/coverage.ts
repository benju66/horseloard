import type { MapDef } from '../data/schemas';

/** A point along a lane, carrying the length of lane it stands for. */
export interface LaneSample {
  x: number;
  y: number;
  /** lane length this sample represents, world units */
  dl: number;
}

const SAMPLE_SPACING = 2; // world units between samples

/** Every lane on a map, chopped into evenly spaced points. */
export function sampleLanes(map: MapDef): LaneSample[] {
  const pts: LaneSample[] = [];
  for (const lane of map.lanes) {
    for (let i = 0; i < lane.waypoints.length - 1; i++) {
      const a = lane.waypoints[i]!;
      const b = lane.waypoints[i + 1]!;
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.floor(seg / SAMPLE_SPACING));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dl: seg / n });
      }
    }
  }
  return pts;
}

/**
 * How much lane a tower at (px, py) with the given reach can shoot — the
 * honest measure of what a plot is worth. Used by the coverage guard (a plot
 * covering nothing is a gold trap) and by the bots (build on the best plots
 * first, whatever map you hand them).
 */
export function plotCoverage(
  samples: readonly LaneSample[],
  px: number,
  py: number,
  reach: number,
): number {
  let covered = 0;
  const rSq = reach * reach;
  for (const p of samples) {
    const dx = p.x - px;
    const dy = p.y - py;
    if (dx * dx + dy * dy <= rSq) covered += p.dl;
  }
  return covered;
}

/** A circle of road watched by something already standing. */
export interface Watcher {
  x: number;
  y: number;
  reach: number;
}

/**
 * Lane length a new tower would watch that *nothing already watches*, and the
 * total it would watch. The ratio is how much breadth a build actually buys.
 *
 * This exists because a value model built on raw range cannot tell a tower that
 * opens new road from a fourth tower stacked on the same corner — and that blind
 * spot is measurable. Handed more starting gold, a greedy bot scoring only
 * value-per-coin went from 3.8 towers to 2.0 on warlords-march and from clearing
 * 2.4 waves to 1.0: **more money, worse defence.** It was buying upgrades on a
 * cluster instead of covering the map, because an upgrade's raw efficiency beats
 * a new tower's once the obvious plots are taken.
 */
export function marginalCoverage(
  samples: readonly LaneSample[],
  watchers: readonly Watcher[],
  px: number,
  py: number,
  reach: number,
): { fresh: number; total: number } {
  let fresh = 0;
  let total = 0;
  const rSq = reach * reach;
  for (const p of samples) {
    const dx = p.x - px;
    const dy = p.y - py;
    if (dx * dx + dy * dy > rSq) continue;
    total += p.dl;
    let seen = false;
    for (const w of watchers) {
      const wx = p.x - w.x;
      const wy = p.y - w.y;
      if (wx * wx + wy * wy <= w.reach * w.reach) {
        seen = true;
        break;
      }
    }
    if (!seen) fresh += p.dl;
  }
  return { fresh, total };
}
