import { describe, it } from 'vitest';
import { SIM_DT, Simulation } from './simulation';
import { validateGameData } from '../data/loader';

import towersJson from '../data/towers.json';
import enemiesJson from '../data/enemies.json';
import abilitiesJson from '../data/abilities.json';
import metatreeJson from '../data/metatree.json';
import heroJson from '../data/hero.json';
import economyJson from '../data/economy.json';
import meadowRoadMapJson from '../data/maps/meadow-road.json';
import meadowRoadWavesJson from '../data/waves/meadow-road.json';

/**
 * Balance harness — a deliberately lazy baseline: ONE tower on plot-3,
 * hero parked mid-map (auto-fire only, no riding, no intercepts), greedy
 * upgrades each build phase. If this clears the map, the map is too easy.
 * Target: the lazy baseline collapses in the late waves; active play wins.
 *
 * On-demand (headless playtest, not a test): `npm run balance`
 */
describe.runIf(import.meta.env.MODE === 'balance')('meadow-road lazy baseline', () => {
  it('reports the run', () => {
    const data = validateGameData({
      towers: towersJson,
      enemies: enemiesJson,
      abilities: abilitiesJson,
      metatree: metatreeJson,
      hero: heroJson,
      economy: economyJson,
      maps: { 'maps/meadow-road.json': meadowRoadMapJson },
      waveSets: { 'waves/meadow-road.json': meadowRoadWavesJson },
    });
    const map = data.maps['meadow-road']!;
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const sim = new Simulation(
      {
        enemies: data.enemies,
        map,
        waveSet: data.waveSets['meadow-road']!,
        hero: data.hero,
        economy: data.economy,
      towers: data.towers,
      },
      rng,
    );

    let leaks = 0;
    sim.enemySystem.onReachEnd.push(() => leaks++);
    sim.hero.x = 260;
    sim.hero.y = 430;

    const spend = () => {
      sim.buildTower('plot-3', 'archer');
      let acted = true;
      while (acted) {
        acted = false;
        const plot = sim.towerSystem.getPlot('plot-3')!;
        if (sim.upgradeTower('plot-3')) acted = true;
        else if (sim.towerSystem.branchOptions(plot).length > 0 && sim.branchTower('plot-3', 'archer-rapid')) acted = true;
        if (sim.buyBowUpgrade()) acted = true;
      }
    };

    const lines: string[] = [];
    for (let wave = 1; wave <= sim.waveRunner.totalWaves; wave++) {
      spend();
      if (!sim.startNextWave()) break;
      let guard = Math.round(180 / SIM_DT);
      while (sim.phase === 'wave' && guard-- > 0) {
        sim.tick();
        sim.hero.x = 260; // parked: undo any shove drift
        sim.hero.y = 430;
      }
      const plot = sim.towerSystem.getPlot('plot-3')!;
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
    console.log('\n' + lines.join('\n'));
  });
});
