import type { Economy, Enemy, Hero, MapDef } from '../data/schemas';

/**
 * Shared engine-test fixtures. Deliberately fake content — the engine must
 * not care that none of it ships. (Not a .test.ts file: no tests run here.)
 */

export const TEST_HERO: Hero = {
  moveSpeed: 100,
  radius: 10,
  margins: { x: 16, top: 20, bottom: 20 },
  bow: {
    projectile: { speed: 400, spriteRef: 'x' },
    levels: [
      { cost: 0, damage: 5, fireInterval: 0.5, range: 50 },
      { cost: 30, damage: 8, fireInterval: 0.4, range: 60 },
    ],
  },
  trample: { damage: 6, perEnemyCooldown: 1 },
  stagger: { controlLossDuration: 0.4, shoveDistance: 40, perEnemyCooldown: 1.2 },
};

export const TEST_ECONOMY: Economy = { startingGold: 45 };

export function makeEnemy(overrides: Partial<Enemy> & { id: string }): Enemy {
  return {
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
  };
}
