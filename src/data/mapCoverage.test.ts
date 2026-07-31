import { describe, expect, it } from 'vitest';
import { loadGameData } from './loader';
import { plotCoverage, sampleLanes } from '../engine/coverage';

/**
 * Every plot on every map must give EVERY level-1 tower something to do —
 * a plot that no freshly-built tower can reach the road from is a gold
 * trap the player can't diagnose (found by playtest: meadow-road plot-5
 * reached nothing at any L1 range; ford upper-bank reached nothing at
 * frost range). Guard the whole class.
 */
const MIN_COVERAGE_UNITS = 40;

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
        const coverage = plotCoverage(pts, plot.position.x, plot.position.y, weakest.reach);
        expect(
          coverage,
          `plot "${plot.id}" covers only ${Math.round(coverage)}u at range ${weakest.reach} — a gold trap`,
        ).toBeGreaterThanOrEqual(MIN_COVERAGE_UNITS);
      }
    });
  }
});
