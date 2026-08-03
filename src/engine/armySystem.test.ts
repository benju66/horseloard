import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile, Tower, TowersFile } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';

/**
 * The army pillar (TRIANGLE.md §B.2). What matters here is not that soldiers
 * exist but that they produce **exposure**: an enemy that meets one stops
 * advancing, and starts again the moment the soldier falls. Everything else in
 * this file guards a way that could quietly stop being true — a block that
 * never releases is a stall, a block that never happens is a fourth tower.
 */

function advanceSeconds(sim: Simulation, seconds: number): void {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) sim.tick();
}

/** A garrison tower with a single soldier, so pairing is unambiguous. */
function barracks(overrides?: Partial<NonNullable<Tower['levels'][number]['garrison']>>): Tower {
  const garrison = {
    squad: 1,
    hp: 40,
    damage: 2,
    attackInterval: 1,
    respawn: 5,
    rallyRange: 200,
    engageRadius: 60,
    spacing: 20,
    ...overrides,
  };
  return {
    id: 'test-barracks',
    name: 'Test Barracks',
    description: 'test',
    targeting: 'none',
    targetsFlying: true,
    unlockedByDefault: true,
    projectileId: null,
    spriteRef: 'x',
    levels: [
      { cost: 25, damage: 0, range: 60, fireInterval: 1, garrison },
      { cost: 40, damage: 0, range: 60, fireInterval: 1, garrison: { ...garrison, squad: 2 } },
      { cost: 70, damage: 0, range: 60, fireInterval: 1, garrison: { ...garrison, squad: 3 } },
    ],
    branches: [
      {
        id: 'test-barracks-a',
        name: 'A',
        description: 'test',
        cost: 100,
        stats: { damage: 0, range: 60, fireInterval: 1, garrison: { ...garrison, squad: 2 } },
      },
      {
        id: 'test-barracks-b',
        name: 'B',
        description: 'test',
        cost: 100,
        stats: { damage: 0, range: 60, fireInterval: 1 },
      },
    ],
  };
}

function fixture(overrides?: {
  enemies?: EnemiesFile['enemies'];
  towers?: TowersFile;
}): SimData {
  return {
    enemies: {
      elite: { chance: 0, hpMultiplier: 2.5, coinMultiplier: 2 },
      // Slow and tough: the walk down the lane is the thing being measured, so
      // it must not finish on its own inside a test.
      enemies: overrides?.enemies ?? [makeEnemy({ id: 'walker', speed: 10, hp: 400, siegeDps: 2 })],
    },
    map: makeMap({
      heroSpawn: { x: 90, y: 190 },
      laneWaypoints: [
        { x: 20, y: 0 },
        { x: 20, y: 190 },
      ],
    }),
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
    towers: overrides?.towers ?? makeTowersFile([barracks()]),
  };
}

/** Park the hero far away so its bow never contaminates a damage measurement. */
function parkHero(sim: Simulation): void {
  sim.hero.x = 95;
  sim.hero.y = 195;
}

describe('blocking', () => {
  it('stops an enemy that walks into a soldier, and lets it go when the soldier dies', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.buildTower('p1', 'test-barracks');
    parkHero(sim);
    const e = sim.enemySystem.spawn('walker', 'main', 1);

    // The plot sits at (10,10) and the lane runs up x=20, so the post lands on
    // the road just ahead of the spawn.
    advanceSeconds(sim, 3);
    expect(e.state).toBe('blocked');
    const heldAt = e.distance;

    // Held means held: distance does not advance while the fight is on.
    advanceSeconds(sim, 2);
    expect(e.distance).toBe(heldAt);

    // Kill the soldier out from under it and the walk resumes from the same
    // spot — no teleport, no lost progress.
    const soldier = sim.army.soldiers[0]!;
    soldier.hp = 0.0001;
    advanceSeconds(sim, 0.5);
    expect(soldier.respawnIn).toBeGreaterThan(0);
    expect(e.state).toBe('walking');
    expect(e.blockedBy).toBeNull();

    advanceSeconds(sim, 1);
    expect(e.distance).toBeGreaterThan(heldAt);
  });

  it('replaces a fallen soldier on its respawn timer', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.buildTower('p1', 'test-barracks');
    parkHero(sim);
    sim.tick(); // the squad is raised on the first tick, not at build time
    const soldier = sim.army.soldiers[0]!;

    soldier.hp = 0;
    advanceSeconds(sim, SIM_DT * 2);
    expect(sim.army.standingCount).toBe(0);

    advanceSeconds(sim, 5);
    expect(sim.army.standingCount).toBe(1);
    expect(soldier.hp).toBe(soldier.maxHp);
  });

  it('holds one enemy per soldier — the rest walk past', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.buildTower('p1', 'test-barracks'); // squad of 1
    parkHero(sim);
    const first = sim.enemySystem.spawn('walker', 'main', 1);
    const second = sim.enemySystem.spawn('walker', 'main', 1);

    advanceSeconds(sim, 3);
    const blocked = [first, second].filter((e) => e.state === 'blocked');
    // This is the property that stops the army clearing a map alone: exposure
    // is capped by squad size, so a wave big enough simply flows around it.
    expect(blocked).toHaveLength(1);
    expect([first, second].filter((e) => e.state === 'walking')).toHaveLength(1);
  });

  it('cannot hold a flier or a block-immune enemy', () => {
    for (const config of [{ flying: true }, { blockImmune: true }]) {
      const sim = new Simulation(
        fixture({
          enemies: [makeEnemy({ id: 'walker', speed: 10, hp: 400, siegeDps: 2, ...config })],
        }),
        TEST_RNG,
      );
      sim.buildTower('p1', 'test-barracks');
      parkHero(sim);
      const e = sim.enemySystem.spawn('walker', 'main', 1);

      advanceSeconds(sim, 4);
      expect(e.state).toBe('walking');
      expect(e.blockedBy).toBeNull();
    }
  });

  it('a wave is not clear while an enemy is still held', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.buildTower('p1', 'test-barracks');
    parkHero(sim);
    sim.startNextWave();

    advanceSeconds(sim, 4);
    expect(sim.enemySystem.enemies.some((e) => e.state === 'blocked')).toBe(true);
    // A blocked enemy has neither arrived nor died. Counting the wave clear
    // here would hand over a free build phase mid-fight.
    expect(sim.phase).toBe('wave');
  });
});

describe('the army is not a damage source', () => {
  it('an anti-infantry enemy cuts through a soldier far faster than it is cut', () => {
    const halberd = makeEnemy({
      id: 'halberd',
      speed: 10,
      hp: 400,
      siegeDps: 6,
      antiInfantry: 4,
    });
    const sim = new Simulation(
      fixture({ enemies: [makeEnemy({ id: 'walker', speed: 10, hp: 400, siegeDps: 2 }), halberd] }),
      TEST_RNG,
    );
    sim.buildTower('p1', 'test-barracks');
    parkHero(sim);
    const e = sim.enemySystem.spawn('halberd', 'main', 1);

    advanceSeconds(sim, 1);
    expect(e.state).toBe('blocked');
    // 6 dps × 4 = 24/s against 40 hp: the line does not hold this for long,
    // which is the point — the answer is towers covering the post, not a
    // bigger squad.
    advanceSeconds(sim, 1.5);
    expect(sim.army.standingCount).toBe(0);
    expect(e.state).toBe('walking');
    // And it barely scratched the enemy on the way down.
    expect(e.hp).toBeGreaterThan(e.maxHp * 0.95);
  });
});

describe('reconciling with the plots', () => {
  it('raises a squad on build and retires it on sell', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    expect(sim.army.soldiers).toHaveLength(0);

    sim.buildTower('p1', 'test-barracks');
    sim.tick();
    expect(sim.army.soldiers).toHaveLength(1);

    sim.sellTower('p1');
    sim.tick();
    expect(sim.army.soldiers).toHaveLength(0);
  });

  it('resizes the squad when an upgrade changes it', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.buildTower('p1', 'test-barracks');
    sim.tick();
    expect(sim.army.soldiers).toHaveLength(1);

    sim.upgradeTower('p1');
    sim.tick();
    expect(sim.army.soldiers).toHaveLength(2);
  });

  it('retires the squad when a branch drops the garrison, and frees what it held', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.buildTower('p1', 'test-barracks');
    parkHero(sim);
    const e = sim.enemySystem.spawn('walker', 'main', 1);
    advanceSeconds(sim, 3);
    expect(e.state).toBe('blocked');

    sim.upgradeTower('p1');
    sim.upgradeTower('p1');
    sim.branchTower('p1', 'test-barracks-b'); // branch B has no garrison
    sim.tick();

    expect(sim.army.soldiers).toHaveLength(0);
    // A retired squad must hand back its prisoners, or the enemy stands on the
    // road forever and the wave never ends.
    expect(e.state).toBe('walking');
    expect(e.blockedBy).toBeNull();
  });

  it('posts soldiers on the lane, not on the plot', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.buildTower('p1', 'test-barracks');
    sim.tick();
    const s = sim.army.soldiers[0]!;
    // Lane runs up x=20; the plot is at (10,10). A soldier standing at home
    // blocks nothing, which is the whole failure this asserts against.
    expect(Math.abs(s.postX - 20)).toBeLessThan(2);
  });

  it('keeps soldiers home when no lane is within rally range', () => {
    const sim = new Simulation(
      fixture({ towers: makeTowersFile([barracks({ rallyRange: 4 })]) }),
      TEST_RNG,
    );
    sim.buildTower('p1', 'test-barracks');
    sim.tick();
    const s = sim.army.soldiers[0]!;
    expect(Math.hypot(s.postX - 10, s.postY - 10)).toBeLessThan(30);
  });
});
