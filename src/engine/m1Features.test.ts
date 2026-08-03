import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { Ability, EnemiesFile, Tower, TowersFile } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';

function advanceSeconds(sim: Simulation, seconds: number): void {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) sim.tick();
}

/**
 * Triggers are deliberately impossible here. Abilities fire themselves in the
 * game, so a fixture on a `cooldown` trigger would cast before the test got to,
 * and every assertion about `castAbility` returning true would race the sim.
 * These tests are about what an effect *does*; `auto-casting` below covers when
 * it happens.
 */
const ABILITIES: Ability[] = [
  {
    id: 'whirling-blades',
    name: 'Whirling Blades',
    description: 'x',
    cooldown: 12,
    unlockedByDefault: false,
    trigger: { type: 'enemies-near', count: 99, radius: 1 },
    effect: {
      type: 'orbit',
      blades: 2,
      radius: 30,
      bladeRadius: 12,
      revolutionsPerSecond: 1,
      damagePerSecond: 20,
      duration: 3,
    },
    iconRef: 'x',
  },
  {
    id: 'volley',
    name: 'Volley',
    description: 'x',
    cooldown: 18,
    unlockedByDefault: false,
    trigger: { type: 'enemies-near', count: 99, radius: 1 },
    effect: { type: 'aoe-damage', damage: 35, radius: 90 },
    iconRef: 'x',
  },
  {
    id: 'rapid-fire',
    name: 'Rapid Fire',
    description: 'x',
    cooldown: 16,
    unlockedByDefault: false,
    trigger: { type: 'enemies-near', count: 99, radius: 1 },
    effect: { type: 'hero-buff', stat: 'bowFireRate', multiplier: 3, duration: 2 },
    iconRef: 'x',
  },
  {
    id: 'heavy-shaft',
    name: 'Heavy Shaft',
    description: 'x',
    cooldown: 13,
    unlockedByDefault: false,
    trigger: { type: 'enemies-near', count: 99, radius: 1 },
    effect: { type: 'pierce-shot', damage: 60, range: 200, halfWidth: 15 },
    iconRef: 'x',
  },
  {
    id: 'caltrops',
    name: 'Caltrops',
    description: 'x',
    cooldown: 18,
    unlockedByDefault: false,
    trigger: { type: 'enemies-near', count: 99, radius: 1 },
    effect: { type: 'ground-zone', radius: 60, duration: 2.2, damagePerSecond: 20, slowMultiplier: 0.5 },
    iconRef: 'x',
  },
  {
    id: 'rally-horn',
    name: 'Rally Horn',
    description: 'x',
    cooldown: 30,
    unlockedByDefault: false,
    trigger: { type: 'enemies-near', count: 99, radius: 1 },
    effect: { type: 'tower-rate-buff', rateMultiplier: 2, duration: 3 },
    iconRef: 'x',
  },
];

function m1Fixture(overrides?: {
  enemies?: EnemiesFile['enemies'];
  towers?: TowersFile;
  eliteChance?: number;
  unlocked?: string[];
}): SimData {
  return {
    enemies: {
      elite: { chance: overrides?.eliteChance ?? 0, hpMultiplier: 2.5, coinMultiplier: 2 },
      enemies: overrides?.enemies ?? [makeEnemy({ id: 'walker', speed: 0.001, hp: 100 })],
    },
    map: makeMap({
      heroSpawn: { x: 84, y: 180 },
      laneWaypoints: [
        { x: 20, y: 20 },
        { x: 20, y: 120 },
      ], // x=20 keeps enemies reachable despite the hero's x>=16 clamp
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
    towers: overrides?.towers ?? makeTowersFile(),
    abilities: ABILITIES,
    unlockedAbilityIds: overrides?.unlocked ?? [],
  };
}

describe('slows and stuns', () => {
  it('slows movement, expires, and freezes at factor 0', () => {
    const sim = new Simulation(m1Fixture({ enemies: [makeEnemy({ id: 'walker', speed: 60, hp: 100 })] }), TEST_RNG);
    const e = sim.enemySystem.spawn('walker', 'main', 1);
    sim.enemySystem.applySlow(e.id, 0.5, 0.5);
    advanceSeconds(sim, 0.5);
    expect(e.distance).toBeCloseTo(15, 0); // 60 × 0.5 × 0.5s
    advanceSeconds(sim, 0.5); // slow expired
    expect(e.distance).toBeCloseTo(45, 0);

    sim.enemySystem.applySlow(e.id, 0, 0.5); // freeze
    const before = e.distance;
    advanceSeconds(sim, 0.4);
    expect(e.distance).toBeCloseTo(before, 5);
  });

  it('stronger slows win; vulnerability amplifies damage while slowed', () => {
    const sim = new Simulation(m1Fixture(), TEST_RNG);
    const e = sim.enemySystem.spawn('walker', 'main', 1); // hp 100
    sim.enemySystem.applySlow(e.id, 0.6, 1, 1.25); // Brittle-style
    sim.enemySystem.applySlow(e.id, 0.8, 2); // weaker factor must not overwrite
    expect(e.slowFactor).toBe(0.6);
    sim.enemySystem.applyDamage(e.id, 20);
    expect(e.hp).toBe(75); // 20 × 1.25
    advanceSeconds(sim, 2.1); // slow gone → vulnerability gone
    sim.enemySystem.applyDamage(e.id, 20);
    expect(e.hp).toBe(55);
  });
});

describe('frontal block (Shieldbearer)', () => {
  it('reduces damage from ahead, full damage from behind', () => {
    const shieldbearer = makeEnemy({
      id: 'shieldbearer',
      speed: 0.001,
      hp: 100,
      frontalBlock: { arcDegrees: 150, multiplier: 0.25 },
    });
    const sim = new Simulation(m1Fixture({ enemies: [shieldbearer] }), TEST_RNG);
    const e = sim.enemySystem.spawn('shieldbearer', 'main', 1);
    // lane runs (20,20)→(20,120): facing is +y (down)
    expect(e.facingY).toBe(1);

    sim.enemySystem.applyDamage(e.id, 20, 20, 70); // from ahead (down-path)
    expect(e.hp).toBe(95); // 20 × 0.25

    sim.enemySystem.applyDamage(e.id, 20, 20, -30); // from behind
    expect(e.hp).toBe(75);

    sim.enemySystem.applyDamage(e.id, 20); // sourceless (blast) — no facing check
    expect(e.hp).toBe(55);
  });
});

describe('elite modifier', () => {
  it('rolls elites for eligible enemies: 2.5× hp, double coins on death', () => {
    const alwaysElite = () => 0; // rng below any chance
    const sim = new Simulation(
      m1Fixture({
        eliteChance: 0.08,
        enemies: [makeEnemy({ id: 'walker', speed: 0.001, hp: 100, eliteEligible: true })],
      }),
      alwaysElite,
    );
    const e = sim.enemySystem.spawn('walker', 'main', 1);
    expect(e.isElite).toBe(true);
    expect(e.maxHp).toBe(250);
    sim.enemySystem.applyDamage(e.id, 999);
    expect(sim.economy.coins.reduce((s, c) => s + c.value, 0)).toBe(2); // coinValue 1 × 2
  });

  it('never rolls elites for ineligible enemies', () => {
    const alwaysElite = () => 0;
    const sim = new Simulation(
      m1Fixture({
        eliteChance: 0.9,
        enemies: [makeEnemy({ id: 'walker', hp: 100, eliteEligible: false })],
      }),
      alwaysElite,
    );
    const e = sim.enemySystem.spawn('walker', 'main', 1);
    expect(e.isElite).toBe(false);
    expect(e.maxHp).toBe(100);
  });
});

function auraTowersFile(): TowersFile {
  const base = makeTowersFile();
  base.projectiles.push({
    id: 'test-frost',
    behavior: 'aura', ignoresArmor: false,
    radius: 80,
    tickInterval: 0.5,
    slow: { factor: 0.5, duration: 0.9 },
    vulnerability: 1.25,
    spriteRef: 'x',
  });
  const frost: Tower = {
    id: 'chiller',
    name: 'Chiller',
    description: 'test',
    targeting: 'none',
    targetsFlying: true,
    unlockedByDefault: true,
    projectileId: 'test-frost',
    spriteRef: 'x',
    levels: [
      { cost: 30, damage: 2, range: 80, fireInterval: 1 },
      { cost: 40, damage: 3, range: 80, fireInterval: 1 },
      { cost: 50, damage: 4, range: 80, fireInterval: 1 },
    ],
    branches: [
      { id: 'c-a', name: 'A', description: 'x', cost: 100, stats: { damage: 6, range: 80, fireInterval: 1 } },
      { id: 'c-b', name: 'B', description: 'x', cost: 100, stats: { damage: 2, range: 80, fireInterval: 1 } },
    ],
  };
  base.towers.push(frost);
  return base;
}

describe('aura towers (Frost Spire)', () => {
  it('pulses damage + slow + vulnerability on its own cadence', () => {
    const sim = new Simulation(
      m1Fixture({ towers: auraTowersFile(), enemies: [makeEnemy({ id: 'walker', speed: 20, hp: 100 })] }),
      TEST_RNG,
    );
    sim.buildTower('p1', 'chiller'); // plot at (10,10), radius 80
    const e = sim.enemySystem.spawn('walker', 'main', 1); // (20,20) — inside
    sim.tick(); // first pulse immediately: slow (with vulnerability) lands first → 2 × 1.25
    expect(e.hp).toBeCloseTo(97.5, 5);
    advanceSeconds(sim, 0.5); // second pulse
    expect(e.slowRemaining).toBeGreaterThan(0);
    expect(e.slowFactor).toBe(0.5);
    expect(e.hp).toBeLessThan(98);
  });
});

describe('cluster bomblets and concussion stun', () => {
  it('cluster impact spawns sub-explosions that damage neighbors', () => {
    const file = makeTowersFile();
    const mortar: Tower = {
      ...file.towers[0]!,
      id: 'cluster-mortar',
      name: 'Cluster Mortar',
      targeting: 'first',
      targetsFlying: true,
      unlockedByDefault: true,
      projectileId: 'test-cluster',
    };
    file.projectiles.push({
      id: 'test-cluster',
      behavior: 'aoe', ignoresArmor: false,
      speed: 300,
      radius: 25,
      bomblets: { count: 4, damage: 6, radius: 25, spread: 30 },
      spriteRef: 'x',
    });
    file.towers.push(mortar);
    const sim = new Simulation(m1Fixture({ towers: file }), TEST_RNG);
    sim.buildTower('p1', 'cluster-mortar');
    const a = sim.enemySystem.spawn('walker', 'main', 1);
    a.distance = 20;
    advanceSeconds(sim, 0.5);
    // main blast 5 + some bomblets (TEST_RNG offsets are deterministic)
    expect(a.hp).toBeLessThan(95);
  });

  it('concussion stuns everything in the blast', () => {
    const file = makeTowersFile();
    file.projectiles.push({
      id: 'test-stunbomb',
      behavior: 'aoe', ignoresArmor: false,
      speed: 300,
      radius: 30,
      stun: { factor: 0, duration: 0.8 },
      spriteRef: 'x',
    });
    const stunner: Tower = {
      ...file.towers[0]!,
      id: 'stunner',
      name: 'Stunner',
      projectileId: 'test-stunbomb',
    };
    file.towers.push(stunner);
    const sim = new Simulation(
      m1Fixture({ towers: file, enemies: [makeEnemy({ id: 'walker', speed: 30, hp: 100 })] }),
      TEST_RNG,
    );
    sim.buildTower('p1', 'stunner');
    const e = sim.enemySystem.spawn('walker', 'main', 1);
    advanceSeconds(sim, 0.3); // shell lands
    expect(e.slowRemaining).toBeGreaterThan(0);
    expect(e.slowFactor).toBe(0);
  });
});

describe('mill income and beacon aura', () => {
  it('economy towers drop coins beside themselves on their interval', () => {
    const file = makeTowersFile();
    const mill: Tower = {
      id: 'money-shed',
      name: 'Money Shed',
      description: 'x',
      targeting: 'none',
      targetsFlying: true,
      unlockedByDefault: true,
      projectileId: null,
      spriteRef: 'x',
      levels: [
        { cost: 50, damage: 0, range: 60, fireInterval: 1, income: { value: 4, interval: 2 } },
        { cost: 60, damage: 0, range: 60, fireInterval: 1, income: { value: 6, interval: 2 } },
        { cost: 80, damage: 0, range: 60, fireInterval: 1, income: { value: 9, interval: 2 } },
      ],
      branches: [
        { id: 'm-a', name: 'A', description: 'x', cost: 100, stats: { damage: 0, range: 60, fireInterval: 1, income: { value: 14, interval: 2 } } },
        { id: 'm-b', name: 'B', description: 'x', cost: 100, stats: { damage: 0, range: 60, fireInterval: 1, income: { value: 6, interval: 2 } } },
      ],
    };
    file.towers.push(mill);
    const sim = new Simulation(m1Fixture({ towers: file }), TEST_RNG);
    expect(sim.buildTower('p1', 'money-shed')).toBe(true);
    advanceSeconds(sim, 4.1); // two income drops of 4 near (10,10); hero far at (84,180)
    expect(sim.economy.coins.reduce((s, c) => s + c.value, 0)).toBe(8);
  });

  it('beacon multiplies neighboring tower damage', () => {
    const file = makeTowersFile();
    const beacon: Tower = {
      id: 'lighthouse',
      name: 'Lighthouse',
      description: 'x',
      targeting: 'none',
      targetsFlying: true,
      unlockedByDefault: true,
      projectileId: null,
      spriteRef: 'x',
      levels: [
        { cost: 50, damage: 0, range: 60, fireInterval: 1, towerAura: { radius: 120, damageMultiplier: 1.5 } },
        { cost: 60, damage: 0, range: 60, fireInterval: 1, towerAura: { radius: 120, damageMultiplier: 1.5 } },
        { cost: 80, damage: 0, range: 60, fireInterval: 1, towerAura: { radius: 120, damageMultiplier: 1.5 } },
      ],
      branches: [
        { id: 'l-a', name: 'A', description: 'x', cost: 100, stats: { damage: 0, range: 60, fireInterval: 1 } },
        { id: 'l-b', name: 'B', description: 'x', cost: 100, stats: { damage: 0, range: 60, fireInterval: 1 } },
      ],
    };
    file.towers.push(beacon);
    const map = makeMap({ heroSpawn: { x: 84, y: 180 } });
    map.plots.push({ id: 'p2', position: { x: 40, y: 10 } }); // within beacon radius of p1
    const data = m1Fixture({ towers: file });
    data.map = map;
    const sim = new Simulation(data, TEST_RNG);
    expect(sim.buildTower('p1', 'lighthouse')).toBe(true);
    expect(sim.buildTower('p2', 'bolt-tower')).toBe(true); // damage 5 → buffed to 7.5
    const e = sim.enemySystem.spawn('walker', 'main', 1); // (0,0), ~41 from p2 — in range 60
    advanceSeconds(sim, 0.2); // one shot lands (speed 400, ~41 away)
    expect(e.hp).toBeCloseTo(100 - 7.5, 5);
  });
});

describe('abilities', () => {
  it('volley damages around the hero; locked abilities refuse; cooldowns gate recast', () => {
    const sim = new Simulation(m1Fixture({ unlocked: ['volley'] }), TEST_RNG);
    const e = sim.enemySystem.spawn('walker', 'main', 1); // (0,0)
    sim.hero.x = 20;
    sim.hero.y = 80; // 60 from enemy — inside volley radius 90, outside bow range 50
    expect(sim.castAbility('rally-horn')).toBe(false); // locked
    expect(sim.castAbility('volley')).toBe(true);
    expect(e.hp).toBe(65); // 100 - 35
    expect(sim.castAbility('volley')).toBe(false); // cooling down
    advanceSeconds(sim, 18.1);
    expect(sim.castAbility('volley')).toBe(true);
    expect(e.hp).toBe(30);
  });

  /**
   * The two effects that carry TRIANGLE.md §B.3: hero power on a cooldown
   * rather than on the bow. What matters in both is that the power *expires* —
   * a buff that outlived its duration, or a shot that hit outside its corridor,
   * would quietly restore the sustain the whole design removes.
   */
  it('rapid fire multiplies bow rate, then expires', () => {
    const sim = new Simulation(m1Fixture({ unlocked: ['rapid-fire'] }), TEST_RNG);
    sim.enemySystem.spawn('walker', 'main', 1); // (20,20)
    sim.hero.x = 20;
    sim.hero.y = 60; // 40 away — inside the fixture bow range of 50
    let shots = 0;
    sim.projectileSystem.onSpawn.push(() => shots++);

    advanceSeconds(sim, 2);
    const unbuffed = shots;

    expect(sim.castAbility('rapid-fire')).toBe(true);
    expect(sim.hero.buffFactor('bowFireRate')).toBe(3);
    advanceSeconds(sim, 2);
    const buffed = shots - unbuffed;
    expect(buffed).toBeGreaterThan(unbuffed * 2); // ×3 rate, allowing for cooldown phase

    // And it lets go: the factor returns to 1 and the rate comes back down.
    advanceSeconds(sim, 0.1);
    expect(sim.hero.buffFactor('bowFireRate')).toBe(1);
    const before = shots;
    advanceSeconds(sim, 2);
    expect(shots - before).toBeLessThanOrEqual(unbuffed + 1);
  });

  it('re-casting a buff refreshes rather than stacking', () => {
    const sim = new Simulation(m1Fixture({ unlocked: ['rapid-fire'] }), TEST_RNG);
    sim.castAbility('rapid-fire');
    advanceSeconds(sim, 1);
    sim.abilities.getSlot('rapid-fire')!.cooldownRemaining = 0;
    sim.castAbility('rapid-fire');
    // Stacking would compound into exactly the sustain a cooldown exists to cap.
    expect(sim.hero.buffFactor('bowFireRate')).toBe(3);
  });

  it('heavy shaft hits everything in the corridor ahead and nothing outside it', () => {
    const sim = new Simulation(m1Fixture({ unlocked: ['heavy-shaft'] }), TEST_RNG);
    const inLine = sim.enemySystem.spawn('walker', 'main', 1);
    sim.hero.x = 20;
    sim.hero.y = 100;
    sim.hero.headingX = 0;
    sim.hero.headingY = -1; // facing the enemy at (20,20)

    expect(sim.castAbility('heavy-shaft')).toBe(true);
    expect(inLine.hp).toBe(40); // 100 - 60

    // Facing away: same enemy, same distance, no hit — the segment test is what
    // stops this being a free 360° nuke.
    sim.abilities.getSlot('heavy-shaft')!.cooldownRemaining = 0;
    sim.hero.headingY = 1;
    sim.castAbility('heavy-shaft');
    expect(inLine.hp).toBe(40);
  });

  /**
   * Caltrops is the one hero tool that keeps working after the cast, so the
   * things worth pinning are that it pulses instead of nuking, that it slows
   * only what is actually standing in it, and that it stops existing when its
   * duration runs out. A zone that outlived its timer would be permanent free
   * damage — sustain by the back door.
   */
  it('a ground zone pulses damage and slows what stands in it', () => {
    const sim = new Simulation(m1Fixture({ unlocked: ['caltrops'] }), TEST_RNG);
    const e = sim.enemySystem.spawn('walker', 'main', 1); // (20,20)
    sim.hero.x = 20;
    sim.hero.y = 20;

    expect(sim.castAbility('caltrops')).toBe(true);
    expect(sim.zones.zones).toHaveLength(1);
    expect(e.hp).toBe(100); // nothing on the cast itself — it is not a nuke

    // Ride off. The patch stays where it was dropped, which is the whole point,
    // and it also takes the hero's bow out of range so the only damage the
    // enemy takes from here is the zone's.
    sim.hero.y = 400;

    advanceSeconds(sim, 0.6); // one pulse: 20 dps × 0.5s
    expect(e.hp).toBeCloseTo(90, 5);
    expect(e.slowFactor).toBe(0.5);

    advanceSeconds(sim, 1); // pulses at 1.0s and 1.5s
    expect(e.hp).toBeCloseTo(70, 5);

    advanceSeconds(sim, 0.8); // the 2.0s pulse lands, then the 2.2s duration is spent
    expect(e.hp).toBeCloseTo(60, 5);
    expect(sim.zones.zones).toHaveLength(0);

    // Expired: no further pulses, and the slow lapses on its own.
    advanceSeconds(sim, 1);
    expect(e.hp).toBeCloseTo(60, 5);
    expect(e.slowFactor).toBe(1);
  });

  it('a ground zone ignores what never enters it', () => {
    const sim = new Simulation(m1Fixture({ unlocked: ['caltrops'] }), TEST_RNG);
    const e = sim.enemySystem.spawn('walker', 'main', 1); // (20,20)
    sim.hero.x = 20;
    sim.hero.y = 120; // 100 away, zone radius 60

    sim.castAbility('caltrops');
    advanceSeconds(sim, 2);
    expect(e.hp).toBe(100);
    expect(e.slowFactor).toBe(1);
  });

  /**
   * The equip cap is the hero's damage ceiling (abilities.json `equipSlots`).
   * A cooldown bounds one ability; only this bounds the sum of them, which is
   * what keeps a roster of burst tools from adding up to sustain.
   */
  it('carries only as many abilities as there are equip slots', () => {
    const sim = new Simulation(
      { ...m1Fixture({ unlocked: ['volley', 'whirling-blades', 'rapid-fire', 'heavy-shaft'] }), equipSlots: 2 },
      TEST_RNG,
    );
    // Slots fill in roster order and stop at the cap; the rest are turned away.
    expect(sim.abilities.slots.filter((s) => s.unlocked).map((s) => s.ability.id)).toEqual([
      'whirling-blades',
      'volley',
    ]);
    expect(sim.abilities.hasFreeSlot).toBe(false);
    expect(sim.abilities.unlock('caltrops')).toBe(false);
    expect(sim.castAbility('caltrops')).toBe(false);
  });

  it('an unlock lands in a free slot and is ready at once', () => {
    const sim = new Simulation(
      { ...m1Fixture({ unlocked: ['volley'] }), equipSlots: 2 },
      TEST_RNG,
    );
    expect(sim.abilities.equippedCount).toBe(1);

    expect(sim.abilities.unlock('caltrops')).toBe(true);
    expect(sim.abilities.getSlot('caltrops')!.cooldownRemaining).toBe(0);
    // Re-granting an ability already carried buys nothing and must not be
    // reported as a slot filled.
    expect(sim.abilities.unlock('caltrops')).toBe(false);
    expect(sim.abilities.equippedCount).toBe(2);
  });

  it('rally horn speeds up tower fire for its duration', () => {
    const sim = new Simulation(m1Fixture({ unlocked: ['rally-horn'] }), TEST_RNG);
    sim.buildTower('p1', 'bolt-tower'); // interval 0.5, damage 5
    const e = sim.enemySystem.spawn('walker', 'main', 1);
    let shots = 0;
    sim.projectileSystem.onSpawn.push(() => shots++);
    sim.castAbility('rally-horn'); // ×2 for 3s
    advanceSeconds(sim, 3);
    const buffedShots = shots;
    expect(buffedShots).toBeGreaterThanOrEqual(11); // ~0.25s interval
    advanceSeconds(sim, 3); // buff expired → back to 0.5s
    expect(shots - buffedShots).toBeLessThanOrEqual(7);
    expect(e.hp).toBeLessThan(100);
  });

  /**
   * The orbit is what replaced Charge — the one weapon that defends the space
   * *around* the hero rather than a direction from it. Blades circle, so what
   * matters is that they stay attached to a moving hero and still cut.
   */
  it('blades circle the hero, follow them, and expire', () => {
    const sim = new Simulation(m1Fixture({ unlocked: ['whirling-blades'] }), TEST_RNG);
    sim.hero.x = 60;
    sim.hero.y = 60;

    expect(sim.castAbility('whirling-blades')).toBe(true);
    expect(sim.zones.zones).toHaveLength(2); // fixture: 2 blades

    const distances = sim.zones.zones.map((z) => Math.hypot(z.x - 60, z.y - 60));
    for (const d of distances) expect(d).toBeCloseTo(30, 0); // fixture radius

    // Ride away: the ring comes with you, or it is just a ground zone.
    sim.hero.x = 40;
    sim.hero.y = 100;
    sim.tick();
    for (const z of sim.zones.zones) {
      expect(Math.hypot(z.x - 40, z.y - 100)).toBeCloseTo(30, 0);
    }

    advanceSeconds(sim, 3.2); // fixture duration 3
    expect(sim.zones.zones).toHaveLength(0);
  });
});

describe('stars', () => {
  it('scores on damage taken: untouched 3★, light 2★, survived 1★', () => {
    const sim = new Simulation(m1Fixture(), TEST_RNG);
    expect(sim.stars()).toBe(3);
    sim.gate.hp -= 20;
    sim.gate.totalDamageTaken += 20; // 20% of 100 ≤ 30% → 2★
    expect(sim.stars()).toBe(2);
    sim.gate.totalDamageTaken += 20; // 40% > 30% → 1★
    expect(sim.stars()).toBe(1);
    // repair must never restore stars
    sim.gate.repair(999);
    expect(sim.stars()).toBe(1);
  });
});
