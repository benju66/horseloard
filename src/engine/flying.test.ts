import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile, TowersFile } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';
import towersJson from '../data/towers.json';
import enemiesJson from '../data/enemies.json';

/**
 * Flying enemies and the ground-only tower (DESIGN §6 option B).
 *
 * The rule is deliberately absolute: a ground-only tower cannot *see* an
 * airborne enemy, so it holds fire rather than shooting it for less. That is
 * what makes it a hard counter rather than a soft one — the tower has no
 * answer, not a worse answer.
 *
 * Both damage paths need covering, and the aura one is the easy thing to miss:
 * auras bypass shield facing, so it would be natural to let them bypass this
 * too, and "ground only" would silently leak through the one route that ignores
 * everything else.
 */

const GROUND_ONLY = 'ground-tower';
const ALL_TARGET = 'sky-tower';

function towers(auraInstead = false): TowersFile {
  const file = makeTowersFile();
  const base = file.towers[0]!;
  const proj = auraInstead
    ? { id: 'pulse', behavior: 'aura' as const, radius: 200, tickInterval: 0.2, spriteRef: 'x' }
    : { id: 'bolt', behavior: 'instant' as const, spriteRef: 'x' };

  const mk = (id: string, targetsFlying: boolean) => ({
    ...base,
    id,
    name: id,
    targeting: auraInstead ? ('none' as const) : ('nearest' as const),
    targetsFlying,
    projectileId: proj.id,
    levels: base.levels.map((l) => ({ ...l, damage: 100, range: 200, fireInterval: 0.2 })),
  });

  return {
    projectiles: [...file.projectiles, proj as (typeof file.projectiles)[number]],
    towers: [mk(GROUND_ONLY, false), mk(ALL_TARGET, true)],
  };
}

function fixture(enemyFlying: boolean, auraInstead = false): SimData {
  const enemies: EnemiesFile = {
    elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
    enemies: [makeEnemy({ id: 'target', speed: 6, hp: 400, flying: enemyFlying })],
  };
  return {
    enemies,
    map: makeMap({ heroSpawn: { x: 95, y: 195 } }), // parked far away; his bow must not interfere
    waveSet: {
      mapId: 'straight',
      waves: [
        { hpMultiplier: 1, entries: [{ enemyId: 'target', count: 1, spacing: 1, laneId: 'main', delay: 0 }] },
      ],
    },
    hero: { ...TEST_HERO, bow: { ...TEST_HERO.bow, levels: TEST_HERO.bow.levels.map((l) => ({ ...l, damage: 0 })) } },
    economy: { ...TEST_ECONOMY, startingGold: 9999 },
    towers: towers(auraInstead),
  };
}

/** Build the named tower on the map's one plot, run a wave, report damage done. */
function damageDealt(towerId: string, enemyFlying: boolean, auraInstead = false): number {
  const sim = new Simulation(fixture(enemyFlying, auraInstead), TEST_RNG);
  const plot = sim.towerSystem.plots[0]!;
  expect(sim.buildTower(plot.plotId, towerId)).toBe(true);
  sim.startNextWave();
  for (let i = 0; i < Math.round(6 / SIM_DT) && sim.enemySystem.enemies.length === 0; i++) sim.tick();
  const enemy = sim.enemySystem.enemies[0];
  if (!enemy) return -1; // never spawned — the fixture is wrong, not the rule
  const startHp = enemy.hp;
  for (let i = 0; i < Math.round(6 / SIM_DT); i++) sim.tick();
  const alive = sim.enemySystem.enemies[0];
  return alive ? startHp - alive.hp : startHp;
}

describe('ground-only towers versus flying enemies', () => {
  it('a ground-only tower does nothing at all to a flyer', () => {
    expect(damageDealt(GROUND_ONLY, true)).toBe(0);
  });

  it('the same tower kills the same enemy when it is not flying', () => {
    // Guards the fixture: a zero above must mean the rule fired, not that the
    // tower was out of range or never built.
    expect(damageDealt(GROUND_ONLY, false)).toBeGreaterThan(0);
  });

  it('a tower that targets flying hits it normally', () => {
    expect(damageDealt(ALL_TARGET, true)).toBeGreaterThan(0);
  });

  it('auras respect it too — the path that ignores everything else', () => {
    expect(damageDealt(GROUND_ONLY, true, true)).toBe(0);
    expect(damageDealt(ALL_TARGET, true, true)).toBeGreaterThan(0);
  });
});

describe('the shipped roster', () => {
  it('exactly one tower is ground-only, and exactly one enemy flies', () => {
    // If a second grounded tower ever appears, the flyer stops being a counter
    // to one tower and starts being a tax on several — worth failing loudly.
    // Naming content here is fine: substrate.test.ts exempts `.test.` files
    // precisely because tests SHOULD pin content.
    const grounded = towersJson.towers.filter((t) => (t as { targetsFlying?: boolean }).targetsFlying === false);
    const flyers = enemiesJson.enemies.filter((e) => (e as { flying?: boolean }).flying);
    expect(grounded.map((t) => t.id)).toEqual(['bombard']);
    expect(flyers.map((e) => e.id)).toEqual(['raven']);
  });
});
