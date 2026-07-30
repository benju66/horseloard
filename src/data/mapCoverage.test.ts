import { describe, expect, it } from 'vitest';
import { loadGameData } from './loader';
import type { MapDef } from './schemas';

/**
 * Every plot on every map must give EVERY level-1 tower something to do —
 * a plot that no freshly-built tower can reach the road from is a gold
 * trap the player can't diagnose (found by playtest: meadow-road plot-5
 * reached nothing at any L1 range; ford upper-bank reached nothing at
 * frost range). Guard the whole class.
 */
const MIN_COVERAGE_UNITS = 40;

function sampleLanes(map: MapDef): Array<{ x: number; y: number; dl: number }> {
  const pts: Array<{ x: number; y: number; dl: number }> = [];
  for (const lane of map.lanes) {
    for (let i = 0; i < lane.waypoints.length - 1; i++) {
      const a = lane.waypoints[i]!;
      const b = lane.waypoints[i + 1]!;
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.floor(seg / 2));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dl: seg / n });
      }
    }
  }
  return pts;
}

describe('map plot coverage', () => {
  const data = loadGameData();

  // The weakest reach any level-1 tower has: attacking towers use their L1
  // range; aura towers use the aura def radius; pure economy towers exempt.
  const reaches: Array<{ towerId: string; reach: number }> = [];
  for (const tower of data.towers.towers) {
    const def = data.towers.projectiles.find((p) => p.id === tower.projectileId);
    if (def?.behavior === 'aura') reaches.push({ towerId: tower.id, reach: def.radius });
    else if (tower.targeting !== 'none') reaches.push({ towerId: tower.id, reach: tower.levels[0]!.range });
  }
  const weakest = reaches.reduce((min, r) => (r.reach < min.reach ? r : min));

  for (const [mapId, map] of Object.entries(data.maps)) {
    it(`${mapId}: every plot covers ≥${MIN_COVERAGE_UNITS}u of lane with the weakest L1 tower (${weakest.towerId}, ${weakest.reach})`, () => {
      const pts = sampleLanes(map);
      for (const plot of map.plots) {
        let coverage = 0;
        for (const p of pts) {
          if (Math.hypot(p.x - plot.position.x, p.y - plot.position.y) <= weakest.reach) {
            coverage += p.dl;
          }
        }
        expect(
          coverage,
          `plot "${plot.id}" covers only ${Math.round(coverage)}u at range ${weakest.reach} — a gold trap`,
        ).toBeGreaterThanOrEqual(MIN_COVERAGE_UNITS);
      }
    });
  }
});
