import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile, Tower } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';

/**
 * Plot p1 sits at (10,10); the lane runs down x=0, so a range-60 tower on p1
 * covers roughly the first 70 units of lane. Hero idles far away at (84,180).
 */
function towerFixture(extraTowers: Tower[] = []): SimData {
  const enemies: EnemiesFile = {
    elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
    enemies: [makeEnemy({ id: 'walker', speed: 0.001, hp: 20 })],
  };
  return {
    enemies,
    map: makeMap({ heroSpawn: { x: 84, y: 180 } }),
    waveSet: {
      mapId: 'straight',
      waves: [
        {
          hpMultiplier: 1,
          entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }],
        },
      ],
    },
    hero: TEST_HERO,
    economy: { ...TEST_ECONOMY, startingGold: 500 },
    towers: makeTowersFile(extraTowers),
  };
}

function advanceSeconds(sim: Simulation, seconds: number): void {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) sim.tick();
}

describe('build / upgrade / branch / sell', () => {
  it('build deducts the level-1 cost and occupies the plot', () => {
    const sim = new Simulation(towerFixture(), TEST_RNG);
    expect(sim.buildTower('p1', 'bolt-tower')).toBe(true);
    expect(sim.gold).toBe(475);
    const plot = sim.towerSystem.getPlot('p1')!;
    expect(plot.level).toBe(1);
    expect(sim.buildTower('p1', 'bolt-tower')).toBe(false); // occupied
  });

  it('refuses to build without gold', () => {
    const data = towerFixture();
    data.economy = { ...TEST_ECONOMY, startingGold: 10 };
    const sim = new Simulation(data, TEST_RNG);
    expect(sim.buildTower('p1', 'bolt-tower')).toBe(false);
    expect(sim.gold).toBe(10);
  });

  it('upgrades along the level track, then offers exactly the branch pair', () => {
    const sim = new Simulation(towerFixture(), TEST_RNG);
    sim.buildTower('p1', 'bolt-tower'); // 25
    expect(sim.upgradeTower('p1')).toBe(true); // 40
    expect(sim.upgradeTower('p1')).toBe(true); // 70
    expect(sim.gold).toBe(500 - 135);

    const plot = sim.towerSystem.getPlot('p1')!;
    expect(plot.level).toBe(3);
    expect(sim.towerSystem.upgradeCost(plot)).toBeNull(); // level track exhausted
    expect(sim.upgradeTower('p1')).toBe(false);
    expect(sim.towerSystem.branchOptions(plot).map((b) => b.id)).toEqual([
      'bolt-sniper',
      'bolt-rapid',
    ]);

    expect(sim.branchTower('p1', 'bolt-sniper')).toBe(true); // 110
    expect(plot.level).toBe(4);
    expect(plot.branchId).toBe('bolt-sniper');
    expect(sim.towerSystem.stats(plot)!.damage).toBe(30); // branch stats now live
    expect(sim.towerSystem.branchOptions(plot)).toEqual([]); // choice is permanent
  });

  it('sell refunds 70% of everything invested (floor) and frees the plot', () => {
    const sim = new Simulation(towerFixture(), TEST_RNG);
    sim.buildTower('p1', 'bolt-tower');
    sim.upgradeTower('p1'); // invested 65
    const before = sim.gold;
    expect(sim.sellTower('p1')).toBe(true);
    expect(sim.gold).toBe(before + Math.floor(65 * 0.7)); // +45
    const plot = sim.towerSystem.getPlot('p1')!;
    expect(plot.towerId).toBeNull();
    expect(sim.sellTower('p1')).toBe(false); // nothing left to sell
    expect(sim.buildTower('p1', 'bolt-tower')).toBe(true); // rebuildable
  });
});

describe('firing', () => {
  it('a built tower kills walkers in range; the kill drops coins, the clear sweeps them in', () => {
    const sim = new Simulation(towerFixture(), TEST_RNG);
    sim.buildTower('p1', 'bolt-tower');
    sim.startNextWave();
    advanceSeconds(sim, 4); // walker at (0,~0) is ~14 from plot; dps 10 vs hp 20; sweep flies ~200u
    expect(sim.enemySystem.aliveCount).toBe(0);
    expect(sim.kills).toBe(1);
    expect(sim.phase).toBe('done');
    // 500 − 25 build + 1 swept coin + (10 + 3×1) wave-clear bonus
    expect(sim.gold).toBe(489);
  });

  it('targeting "first" prefers the enemy furthest along the lane', () => {
    const firstTower: Tower = {
      ...makeTowersFile().towers[0]!,
      id: 'vanguard',
      name: 'Vanguard',
      targeting: 'first',
    };
    const sim = new Simulation(towerFixture([firstTower]), TEST_RNG);
    sim.buildTower('p1', 'vanguard');
    const near = sim.enemySystem.spawn('walker', 'main', 1);
    const far = sim.enemySystem.spawn('walker', 'main', 1);
    near.distance = 10;
    far.distance = 40; // further along, still in range of plot (10,10)
    sim.tick();
    expect(sim.projectileSystem.projectiles[0]!.targetId).toBe(far.id);
  });

  it('targeting "strongest" prefers the highest hp', () => {
    const strongTower: Tower = {
      ...makeTowersFile().towers[0]!,
      id: 'executioner',
      name: 'Executioner',
      targeting: 'strongest',
    };
    const sim = new Simulation(towerFixture([strongTower]), TEST_RNG);
    sim.buildTower('p1', 'executioner');
    const weak = sim.enemySystem.spawn('walker', 'main', 1);
    const strong = sim.enemySystem.spawn('walker', 'main', 1);
    weak.distance = 10;
    strong.distance = 20;
    weak.hp = 3;
    sim.tick();
    expect(sim.projectileSystem.projectiles[0]!.targetId).toBe(strong.id);
  });

  it('targeting "none" never fires (economy towers)', () => {
    const mill: Tower = {
      ...makeTowersFile().towers[0]!,
      id: 'money-shed',
      name: 'Money Shed',
      targeting: 'none',
      projectileId: null,
    };
    const sim = new Simulation(towerFixture([mill]), TEST_RNG);
    sim.buildTower('p1', 'money-shed');
    sim.enemySystem.spawn('walker', 'main', 1);
    advanceSeconds(sim, 1);
    expect(sim.projectileSystem.liveCount).toBe(0);
  });
});

describe('substrate rule (the M0.5 acceptance)', () => {
  it('a brand-new tower type works via config alone — zero engine edits', () => {
    // An AoE mortar that exists nowhere in the shipped game:
    const mortar: Tower = {
      id: 'test-mortar',
      name: 'Test Mortar',
      description: 'substrate proof',
      targeting: 'first',
      projectileId: 'test-bomb', // aoe def already in the file
      spriteRef: 'x',
      levels: [
        { cost: 30, damage: 6, range: 80, fireInterval: 0.8 },
        { cost: 50, damage: 9, range: 85, fireInterval: 0.7 },
        { cost: 80, damage: 13, range: 90, fireInterval: 0.6 },
      ],
      branches: [
        { id: 'm-a', name: 'A', description: 'a', cost: 100, stats: { damage: 25, range: 95, fireInterval: 0.9 } },
        { id: 'm-b', name: 'B', description: 'b', cost: 100, stats: { damage: 8, range: 90, fireInterval: 0.25 } },
      ],
    };
    const sim = new Simulation(towerFixture([mortar]), TEST_RNG);
    expect(sim.towerSystem.roster.map((t) => t.id)).toContain('test-mortar');
    expect(sim.buildTower('p1', 'test-mortar')).toBe(true);

    // Two walkers clumped together: one aoe shell damages both.
    const a = sim.enemySystem.spawn('walker', 'main', 1);
    const b = sim.enemySystem.spawn('walker', 'main', 1);
    a.distance = 20;
    b.distance = 30; // ~10 units apart, inside the 30-radius blast
    advanceSeconds(sim, 1);
    expect(a.hp).toBeLessThan(20);
    expect(b.hp).toBeLessThan(20);
  });
});
