import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile, Hero } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, makeEnemy, makeMap } from './testFixtures';

/** Bow that effectively can't fire — contact tests must not be polluted by auto-fire kills. */
const MELEE_HERO: Hero = {
  ...TEST_HERO,
  bow: {
    ...TEST_HERO.bow,
    levels: [{ cost: 0, damage: 5, fireInterval: 0.5, range: 0.001 }],
  },
};

/**
 * Lane runs down x=20 so the hero (clamped to x >= 16) can actually reach
 * contact range. Enemies are near-stationary so contact tests stay put.
 */
function heroFixture(hero: Hero = TEST_HERO): SimData {
  const enemies: EnemiesFile = {
    elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
    enemies: [
      makeEnemy({ id: 'walker', speed: 0.001, hp: 10 }),
      makeEnemy({ id: 'heavy', speed: 0.001, hp: 100, staggersHero: true }),
    ],
  };
  return {
    enemies,
    map: makeMap({
      laneWaypoints: [
        { x: 20, y: 20 },
        { x: 20, y: 120 },
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
    hero,
    economy: TEST_ECONOMY,
  };
}

function advanceSeconds(sim: Simulation, seconds: number): void {
  const ticks = Math.round(seconds / SIM_DT);
  for (let i = 0; i < ticks; i++) sim.tick();
}

describe('hero movement', () => {
  it('moves at config speed and clamps to world margins', () => {
    const sim = new Simulation(heroFixture());
    sim.hero.input.x = 1;
    advanceSeconds(sim, 2); // 200 units requested, world is 100 wide
    expect(sim.hero.x).toBe(84); // width 100 - margin 16
    expect(sim.hero.dir).toBe(1);

    sim.hero.input.x = -1;
    advanceSeconds(sim, 2);
    expect(sim.hero.x).toBe(16);
    expect(sim.hero.dir).toBe(-1);
  });

  it('ignores input inside the deadzone', () => {
    const sim = new Simulation(heroFixture());
    sim.hero.input.x = 0.05;
    advanceSeconds(sim, 1);
    expect(sim.hero.x).toBe(50);
    expect(sim.hero.moving).toBe(false);
  });

  it('scales speed with partial deflection', () => {
    const sim = new Simulation(heroFixture());
    sim.hero.input.x = 0.6;
    sim.hero.input.y = -0.8; // magnitude 1.0
    advanceSeconds(sim, 0.3);
    expect(sim.hero.x).toBeCloseTo(50 + 0.6 * 100 * 0.3, 0);
    expect(sim.hero.y).toBeCloseTo(100 - 0.8 * 100 * 0.3, 0);
    expect(sim.hero.moving).toBe(true);
  });
});

describe('stagger (received)', () => {
  it('heavy contact shoves the hero and cuts control for the configured window', () => {
    const sim = new Simulation(heroFixture(MELEE_HERO));
    const heavy = sim.enemySystem.spawn('heavy', 'main', 1); // at (20, 20)
    const staggeredBy: string[] = [];
    sim.hero.onStagger.push((by) => staggeredBy.push(by.config.id));

    sim.hero.x = 25;
    sim.hero.y = 21;
    sim.tick();
    expect(staggeredBy).toEqual(['heavy']);
    expect(sim.hero.staggered).toBe(true);

    // Control is dead: pushing toward the enemy does nothing while shoved.
    sim.hero.input.x = -1;
    const beforeX = sim.hero.x;
    advanceSeconds(sim, TEST_HERO.stagger.controlLossDuration);
    expect(sim.hero.x).toBeGreaterThan(beforeX); // pushed away (+x), not steered (-x)
    const shoved = Math.hypot(sim.hero.x - 25, sim.hero.y - 21);
    expect(shoved).toBeGreaterThan(TEST_HERO.stagger.shoveDistance * 0.8);
    expect(sim.hero.staggered).toBe(false);
    expect(heavy.hp).toBe(100); // shove is not damage
  });

  it('respects the per-enemy cooldown but not across enemies', () => {
    const sim = new Simulation(heroFixture(MELEE_HERO));
    sim.enemySystem.spawn('heavy', 'main', 1);
    const count: string[] = [];
    sim.hero.onStagger.push((by) => count.push(String(by.id)));

    sim.hero.x = 22;
    sim.hero.y = 22;
    sim.tick();
    expect(count).toHaveLength(1);

    // Recontact the same enemy inside its cooldown: no second stagger.
    advanceSeconds(sim, TEST_HERO.stagger.controlLossDuration + SIM_DT);
    sim.hero.x = 22;
    sim.hero.y = 22;
    sim.tick();
    expect(count).toHaveLength(1);

    // A different heavy staggers immediately.
    const second = sim.enemySystem.spawn('heavy', 'main', 1);
    sim.hero.x = second.x + 2;
    sim.hero.y = second.y + 2;
    sim.tick();
    expect(count).toHaveLength(2);

    // After the first enemy's cooldown lapses it staggers again.
    advanceSeconds(sim, TEST_HERO.stagger.perEnemyCooldown);
    sim.hero.x = 22;
    sim.hero.y = 22;
    sim.tick();
    expect(count).toHaveLength(3);
  });

  it('non-staggering enemies never shove', () => {
    const sim = new Simulation(heroFixture(MELEE_HERO));
    sim.enemySystem.spawn('walker', 'main', 1);
    sim.hero.x = 22;
    sim.hero.y = 22;
    advanceSeconds(sim, 1); // stationary hero: no trample either
    expect(sim.hero.staggered).toBe(false);
    expect(sim.enemySystem.enemies[0]!.hp).toBe(10);
  });
});

describe('trample', () => {
  it('damages on moving contact with a per-enemy cooldown; kills pay gold', () => {
    const sim = new Simulation(heroFixture(MELEE_HERO));
    const walker = sim.enemySystem.spawn('walker', 'main', 1); // hp 10 at (20,20)
    sim.hero.x = 20;
    sim.hero.y = 20;
    sim.hero.input.x = 0.1; // barely moving: stays in contact, counts as riding
    sim.tick();
    expect(walker.hp).toBe(4); // one trample: 10 - 6

    advanceSeconds(sim, 0.5); // inside the 1s per-enemy cooldown
    expect(walker.hp).toBe(4);

    advanceSeconds(sim, 0.6); // cooldown lapsed → second trample kills
    expect(sim.enemySystem.aliveCount).toBe(0);
    expect(sim.gold).toBe(TEST_ECONOMY.startingGold + walker.config.coinValue);
  });

  it('a stationary hero does not trample', () => {
    const sim = new Simulation(heroFixture(MELEE_HERO));
    const walker = sim.enemySystem.spawn('walker', 'main', 1);
    sim.hero.x = 25; // inside contact reach (15), outside even the melee-test bow range
    sim.hero.y = 20;
    advanceSeconds(sim, 2);
    expect(walker.hp).toBe(10);
  });
});

describe('auto-fire bow', () => {
  it('fires at the nearest enemy in range on the fire interval', () => {
    const sim = new Simulation(heroFixture());
    sim.enemySystem.spawn('walker', 'main', 1); // (20, 20), hp 10
    let shots = 0;
    sim.projectileSystem.onSpawn.push(() => shots++);

    sim.hero.x = 20;
    sim.hero.y = 60; // 40 away — inside range 50
    advanceSeconds(sim, 1.2);
    // interval 0.5 → shots at ~0 and ~0.5; two 5-damage arrows kill it, then no target
    expect(shots).toBe(2);
    expect(sim.enemySystem.aliveCount).toBe(0);
    expect(sim.gold).toBe(TEST_ECONOMY.startingGold + 1);
  });

  it('holds fire with nothing in range', () => {
    const sim = new Simulation(heroFixture());
    sim.enemySystem.spawn('walker', 'main', 1); // (20,20); hero at (50,100) is ~85 away
    let shots = 0;
    sim.projectileSystem.onSpawn.push(() => shots++);
    advanceSeconds(sim, 1);
    expect(shots).toBe(0);
  });

  it('arrows fly to a dead target’s last position and despawn cleanly', () => {
    const sim = new Simulation(heroFixture());
    const walker = sim.enemySystem.spawn('walker', 'main', 1);
    sim.hero.x = 20;
    sim.hero.y = 60;
    sim.tick(); // one arrow in flight
    expect(sim.projectileSystem.liveCount).toBe(1);
    sim.enemySystem.applyDamage(walker.id, 999); // dies mid-flight
    advanceSeconds(sim, 1);
    expect(sim.projectileSystem.liveCount).toBe(0);
  });
});

describe('forge (bow levels)', () => {
  it('buys the next level when affordable, caps at max', () => {
    const sim = new Simulation(heroFixture()); // gold 45, L2 costs 30
    expect(sim.hero.bowStats.damage).toBe(5);
    expect(sim.hero.nextBowCost()).toBe(30);

    expect(sim.buyBowUpgrade()).toBe(true);
    expect(sim.hero.bowLevel).toBe(2);
    expect(sim.hero.bowStats.damage).toBe(8);
    expect(sim.gold).toBe(15);

    expect(sim.hero.nextBowCost()).toBeNull(); // maxed (2 levels in fixture)
    expect(sim.buyBowUpgrade()).toBe(false);
    expect(sim.gold).toBe(15);
  });

  it('refuses when gold is short', () => {
    const data = heroFixture();
    data.economy = { startingGold: 10 };
    const sim = new Simulation(data);
    expect(sim.buyBowUpgrade()).toBe(false);
    expect(sim.hero.bowLevel).toBe(1);
    expect(sim.gold).toBe(10);
  });
});
