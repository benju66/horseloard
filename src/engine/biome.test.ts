import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile, MapDef, WaveSet } from '../data/schemas';
import { TERRAIN_RULES } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';

/**
 * Terrain rules (BIOMES.md Part C.4) — the one rule a biome plays under,
 * applied by the Simulation to its own cloned data at construction.
 *
 * These are tested for the same reason the tree's rule effects are: a rule
 * that fails to apply is invisible from inside the game. A biome whose rule
 * silently does nothing is a reskin wearing a rule's name, which is exactly
 * the failure BIOMES.md Part B defines a biome against.
 *
 * Content-agnostic: the fixture reads multipliers off TERRAIN_RULES rather
 * than repeating the numbers, so a rebalance of a rule cannot silently
 * diverge from what is asserted here.
 */

function fixture(terrainRule?: MapDef['terrainRule']): SimData {
  const enemies: EnemiesFile = {
    elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
    enemies: [makeEnemy({ id: 'walker', name: 'Walker', hp: 10 })],
  };
  const waveSet: WaveSet = {
    mapId: 'straight',
    waves: [
      { hpMultiplier: 1, entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }] },
    ],
  };
  const map = makeMap();
  map.terrainRule = terrainRule;
  return {
    enemies,
    map,
    waveSet,
    hero: TEST_HERO,
    economy: TEST_ECONOMY,
    towers: makeTowersFile(),
    abilities: [],
  };
}

describe('terrain rules', () => {
  it('narrow-cuts trades range for damage, levels and branches both', () => {
    const mods = TERRAIN_RULES['narrow-cuts'];
    const plain = new Simulation(fixture(), TEST_RNG);
    const ruled = new Simulation(fixture('narrow-cuts'), TEST_RNG);
    for (const sim of [plain, ruled]) {
      expect(sim.towerSystem.build('p1', 'bolt-tower')).toBe(true);
    }
    const plainStats = plain.towerSystem.stats(plain.towerSystem.plots[0]!)!;
    const ruledStats = ruled.towerSystem.stats(ruled.towerSystem.plots[0]!)!;
    expect(ruledStats.range).toBeCloseTo(plainStats.range * mods.towerRange!, 5);
    expect(ruledStats.damage).toBeCloseTo(plainStats.damage * mods.towerDamage!, 5);
  });

  it('open-country raises enemy speed and tower range together', () => {
    const mods = TERRAIN_RULES['open-country'];
    const plain = new Simulation(fixture(), TEST_RNG);
    const ruled = new Simulation(fixture('open-country'), TEST_RNG);
    for (const sim of [plain, ruled]) {
      sim.enemySystem.spawn('walker', 'main', 1);
      sim.enemySystem.tick(SIM_DT);
    }
    const plainDist = plain.enemySystem.enemies[0]!.distance;
    const ruledDist = ruled.enemySystem.enemies[0]!.distance;
    expect(ruledDist).toBeCloseTo(plainDist * mods.enemySpeed!, 5);

    plain.towerSystem.build('p1', 'bolt-tower');
    ruled.towerSystem.build('p1', 'bolt-tower');
    const plainRange = plain.towerSystem.stats(plain.towerSystem.plots[0]!)!.range;
    const ruledRange = ruled.towerSystem.stats(ruled.towerSystem.plots[0]!)!.range;
    expect(ruledRange).toBeCloseTo(plainRange * mods.towerRange!, 5);
  });

  it('an enemy on the off-screen approach can be hit but never held', () => {
    // The freeze-near-spawn softlock (BIOMES.md Part M): a slow landing on the
    // approach can hold a flyer where ground-only towers cannot see it and the
    // hero's margin clamp cannot reach it — the wave never ends. Slows are
    // refused outside the world bounds, at the applySlow choke point, so
    // auras, stuns, zones and future slow sources are all covered at once.
    const data = fixture();
    data.map.lanes = [
      { id: 'main', waypoints: [{ x: 50, y: -60 }, { x: 50, y: 100 }] },
    ];
    const sim = new Simulation(data, TEST_RNG);
    const e = sim.enemySystem.spawn('walker', 'main', 1);
    expect(e.y).toBeLessThan(0); // still on the approach
    sim.enemySystem.applySlow(e.id, 0, 5);
    expect(e.slowRemaining).toBe(0); // refused — no hold off-screen

    while (e.y < 0) sim.enemySystem.tick(SIM_DT);
    sim.enemySystem.applySlow(e.id, 0, 5);
    expect(e.slowRemaining).toBeGreaterThan(0); // on the field, slows work
  });

  it('a ruled run does not contaminate the shared data it was built from', () => {
    // The harness feeds hundreds of Simulations from one loadGameData() result.
    // The rule multiplies enemy speed, so without the enemies clone a Steppe
    // run would permanently accelerate every later run's walkers.
    const shared = fixture('open-country');
    const baseSpeed = shared.enemies.enemies[0]!.speed;
    void new Simulation(shared, TEST_RNG);
    expect(shared.enemies.enemies[0]!.speed).toBe(baseSpeed);
    const towers = shared.towers.towers[0]!;
    expect(towers.levels[0]!.range).toBe(60);
  });
});
