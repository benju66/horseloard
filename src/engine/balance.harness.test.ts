import { describe, it } from 'vitest';
import { SIM_DT, Simulation } from './simulation';
import { loadGameData } from '../data/loader';
import { plotCoverage, sampleLanes } from './coverage';
import { makeRng, combatValue } from './bots';
import type { MapDef, TowersFile } from '../data/schemas';

/**
 * Balance harness — a deliberately lazy baseline per map: ONE tower, hero
 * parked (auto-fire only, no riding, no intercepts, no abilities), greedy
 * upgrades each build phase. If this clears the map, the map is too easy.
 * Target: the lazy baseline collapses in the late waves; active play wins.
 *
 * The active-play half of the question lives in bots.harness.test.ts.
 *
 * On-demand (headless playtest, not a test): `npm run balance`
 */

interface LazyConfig {
  plotId: string;
  towerId: string;
  branchId: string;
  park: { x: number; y: number };
}

/**
 * Hand-calibrated baselines. These are measuring instruments — the wave a
 * map's lazy run dies on is the number we tune against, so do NOT casually
 * re-pick the plot or park spot; that silently moves the reference.
 * Maps without an entry get a derived config (below), so a new map is
 * covered the day it lands.
 */
const LAZY_CONFIGS: Record<string, LazyConfig> = {
  'meadow-road': {
    plotId: 'plot-3',
    towerId: 'archer',
    branchId: 'archer-rapid',
    park: { x: 260, y: 430 },
  },
  'the-ford': {
    plotId: 'ford-island',
    towerId: 'archer',
    branchId: 'archer-rapid',
    park: { x: 210, y: 470 },
  },
};

/** Best plot, best-value attacking tower, park at the gate. No content names. */
function deriveConfig(map: MapDef, file: TowersFile): LazyConfig {
  const samples = sampleLanes(map);
  const reach = file.towers.reduce((max, t) => Math.max(max, t.levels[0]?.range ?? 0), 0);

  const plot = [...map.plots].sort(
    (a, b) =>
      plotCoverage(samples, b.position.x, b.position.y, reach) -
      plotCoverage(samples, a.position.x, a.position.y, reach),
  )[0]!;

  const attacking = file.towers.filter((t) => t.targeting !== 'none');
  const tower = (attacking.length > 0 ? attacking : file.towers).reduce((best, t) => {
    const def = file.projectiles.find((p) => p.id === t.projectileId) ?? null;
    const bestDef = file.projectiles.find((p) => p.id === best.projectileId) ?? null;
    return combatValue(t.levels[0]!, def) > combatValue(best.levels[0]!, bestDef) ? t : best;
  });
  const def = file.projectiles.find((p) => p.id === tower.projectileId) ?? null;
  const branch = tower.branches.reduce((best, b) =>
    combatValue(b.stats, def) > combatValue(best.stats, def) ? b : best,
  );

  return {
    plotId: plot.id,
    towerId: tower.id,
    branchId: branch.id,
    park: { x: map.gate.position.x, y: map.gate.position.y },
  };
}

describe.runIf(import.meta.env.MODE === 'balance')('lazy baselines', () => {
  const data = loadGameData();

  for (const [mapId, map] of Object.entries(data.maps)) {
    const cfg = LAZY_CONFIGS[mapId] ?? deriveConfig(map, data.towers);
    const derived = LAZY_CONFIGS[mapId] === undefined;

    it(`reports the ${mapId} run`, () => {
      const sim = new Simulation(
        {
          enemies: data.enemies,
          map,
          waveSet: data.waveSets[mapId]!,
          hero: data.hero,
          economy: data.economy,
          towers: data.towers,
        },
        makeRng(42),
      );

      let leaks = 0;
      sim.enemySystem.onReachEnd.push(() => leaks++);
      sim.hero.x = cfg.park.x;
      sim.hero.y = cfg.park.y;

      const spend = () => {
        sim.buildTower(cfg.plotId, cfg.towerId);
        let acted = true;
        while (acted) {
          acted = false;
          const plot = sim.towerSystem.getPlot(cfg.plotId)!;
          if (sim.upgradeTower(cfg.plotId)) acted = true;
          else if (
            sim.towerSystem.branchOptions(plot).length > 0 &&
            sim.branchTower(cfg.plotId, cfg.branchId)
          )
            acted = true;
          if (sim.buyBowUpgrade()) acted = true;
        }
      };

      const lines: string[] = [];
      for (let wave = 1; wave <= sim.waveRunner.totalWaves; wave++) {
        spend();
        if (!sim.startNextWave()) break;
        let guard = Math.round(240 / SIM_DT);
        while (sim.phase === 'wave' && guard-- > 0) {
          sim.tick();
          sim.hero.x = cfg.park.x; // parked: undo any shove drift
          sim.hero.y = cfg.park.y;
        }
        const plot = sim.towerSystem.getPlot(cfg.plotId)!;
        lines.push(
          `w${wave}: phase=${sim.phase} gate=${Math.ceil(sim.gate.hp)}/${sim.gate.maxHp} leaks=${leaks} ` +
            `besiegers=${sim.gate.besiegerCount}+q${sim.gate.queueLength} kills=${sim.kills} gold=${sim.gold} ` +
            `tower=L${plot.level}${plot.branchId ? '(' + plot.branchId + ')' : ''} bow=L${sim.hero.bowLevel}`,
        );
        if (sim.phase === 'defeat') break;
        if (sim.phase === 'wave') {
          lines.push('  → stalled: besiegers out of parked hero reach (counts as a failed lazy run)');
          break;
        }
      }
      const tag = derived ? ' (derived config — not yet hand-calibrated)' : '';
      console.log(
        `\n[${mapId}]${tag} plot=${cfg.plotId} tower=${cfg.towerId}\n` + lines.join('\n'),
      );
    });
  }
});
