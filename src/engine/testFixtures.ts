import type { Economy, Enemy, Hero, MapDef, Tower, TowersFile } from '../data/schemas';
import { MapCameraSchema, MapLightingSchema } from '../data/schemas';

/**
 * Shared engine-test fixtures. Deliberately fake content — the engine must
 * not care that none of it ships. (Not a .test.ts file: no tests run here.)
 */

export const TEST_HERO: Hero = {
  moveSpeed: 100,
  radius: 10,
  margins: { x: 16, top: 20, bottom: 20 },
  bow: {
    projectile: { speed: 400, spriteRef: 'x', ignoresArmor: true },
    levels: [
      { cost: 0, damage: 5, fireInterval: 0.5, range: 50 },
      { cost: 30, damage: 8, fireInterval: 0.4, range: 60 },
    ],
  },
  trample: { damage: 6, perEnemyCooldown: 1 },
  stagger: { controlLossDuration: 0.4, shoveDistance: 40, perEnemyCooldown: 1.2, immunityAfter: 0.9 },
};

export const TEST_ECONOMY: Economy = {
  startingGold: 45,
  sellRefund: 0.7,
  coins: { magnetRadius: 80, collectRadius: 20, expirySeconds: 12, magnetSpeed: 260 },
  waveClearBonus: { base: 10, perWave: 3 },
  earlyStart: { windowSeconds: 12, maxBonus: 15 },
  repair: { hpPerPurchase: 20, costPerHp: 0.5 },
  tokens: { perStarFirstTime: 10, perWaveOnDefeat: 1, endlessMilestoneEvery: 10, perEndlessMilestone: 5 },
  xp: { base: 30, growth: 1.12, perKillDefault: 3, eliteMultiplier: 3 },
  stars: { twoStarMaxDamageFraction: 0.3 },
};

/** Deterministic rng for tests: no coin scatter, no surprises. */
export const TEST_RNG = () => 0.5;

export function makeTowersFile(extraTowers: Tower[] = []): TowersFile {
  return {
    projectiles: [
      { id: 'test-arrow', behavior: 'ballistic', ignoresArmor: false, speed: 400, spriteRef: 'x' },
      { id: 'test-bomb', behavior: 'aoe', ignoresArmor: false, speed: 300, radius: 30, spriteRef: 'x' },
    ],
    towers: [
      {
        id: 'bolt-tower',
        name: 'Bolt Tower',
        description: 'test',
        targeting: 'nearest',
        targetsFlying: true,
        unlockedByDefault: true,
        projectileId: 'test-arrow',
        spriteRef: 'x',
        levels: [
          { cost: 25, damage: 5, range: 60, fireInterval: 0.5 },
          { cost: 40, damage: 8, range: 65, fireInterval: 0.4 },
          { cost: 70, damage: 12, range: 70, fireInterval: 0.3 },
        ],
        branches: [
          {
            id: 'bolt-sniper',
            name: 'Sniper',
            description: 'test',
            cost: 110,
            stats: { damage: 30, range: 90, fireInterval: 0.6 },
          },
          {
            id: 'bolt-rapid',
            name: 'Rapid',
            description: 'test',
            cost: 110,
            stats: { damage: 4, range: 70, fireInterval: 0.1 },
          },
        ],
      },
      ...extraTowers,
    ],
  };
}

export function makeEnemy(overrides: Partial<Enemy> & { id: string }): Enemy {
  return {
    armor: 0,
    flying: false,
    blockImmune: false,
    name: overrides.id,
    hp: 10,
    speed: 10,
    radius: 5,
    coinValue: 1,
    siegeDps: 1,
    staggersHero: false,
    eliteEligible: false,
    spriteRef: 'x',
    ...overrides,
  };
}

export function makeMap(overrides?: {
  laneWaypoints?: Array<{ x: number; y: number }>;
  heroSpawn?: { x: number; y: number };
}): MapDef {
  return {
    id: 'straight',
    name: 'Straight',
    description: 'test',
    order: 1,
    world: { width: 100, height: 200 },
    heroSpawn: overrides?.heroSpawn ?? { x: 50, y: 100 },
    lanes: [
      {
        id: 'main',
        waypoints: overrides?.laneWaypoints ?? [
          { x: 0, y: 0 },
          { x: 0, y: 100 },
        ],
      },
    ],
    plots: [{ id: 'p1', position: { x: 10, y: 10 } }],
    gate: { position: { x: 0, y: 110 }, hp: 100, attackSlots: 5 },
    forge: { position: { x: 20, y: 20 } },
    // Render-layer blocks: take the schema's own defaults rather than
    // duplicating literals that would drift out of sync.
    camera: MapCameraSchema.parse({}),
    lighting: MapLightingSchema.parse({}),
  };
}
