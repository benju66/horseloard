import { describe, it } from 'vitest';
import { SIM_DT, Simulation } from './simulation';
import { validateGameData } from '../data/loader';

import towersJson from '../data/towers.json';
import enemiesJson from '../data/enemies.json';
import abilitiesJson from '../data/abilities.json';
import metatreeJson from '../data/metatree.json';
import heroJson from '../data/hero.json';
import economyJson from '../data/economy.json';
import archetypesJson from '../data/archetypes.json';
import meadowRoadMapJson from '../data/maps/meadow-road.json';
import meadowRoadWavesJson from '../data/waves/meadow-road.json';
import theFordMapJson from '../data/maps/the-ford.json';
import theFordWavesJson from '../data/waves/the-ford.json';

/**
 * Balance harness — a deliberately lazy baseline per map: ONE tower, hero
 * parked (auto-fire only, no riding, no intercepts, no abilities), greedy
 * upgrades each build phase. If this clears the map, the map is too easy.
 * Target: the lazy baseline collapses in the late waves; active play wins.
 *
 * On-demand (headless playtest, not a test): `npm run balance`
 */
const LAZY_CONFIGS: Record<
  string,
  { plotId: string; towerId: string; branchId: string; park: { x: number; y: number } }
> = {
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

describe.runIf(import.meta.env.MODE === 'balance')('lazy baselines', () => {
  const data = validateGameData({
    towers: towersJson,
    enemies: enemiesJson,
    abilities: abilitiesJson,
    metatree: metatreeJson,
    hero: heroJson,
    economy: economyJson,
    archetypes: archetypesJson,
    maps: {
      'maps/meadow-road.json': meadowRoadMapJson,
      'maps/the-ford.json': theFordMapJson,
    },
    waveSets: {
      'waves/meadow-road.json': meadowRoadWavesJson,
      'waves/the-ford.json': theFordWavesJson,
    },
  });

  for (const [mapId, cfg] of Object.entries(LAZY_CONFIGS)) {
    it(`reports the ${mapId} run`, () => {
      let seed = 42;
      const rng = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      const sim = new Simulation(
        {
          enemies: data.enemies,
          map: data.maps[mapId]!,
          waveSet: data.waveSets[mapId]!,
          hero: data.hero,
          economy: data.economy,
          towers: data.towers,
        },
        rng,
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
      console.log(`\n[${mapId}]\n` + lines.join('\n'));
    });
  }
});
