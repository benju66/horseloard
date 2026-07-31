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
