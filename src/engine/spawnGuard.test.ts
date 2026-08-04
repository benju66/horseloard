import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile, WaveSet } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';

/**
 * The spawn-approach guard (BIOMES.md Part M): an enemy still on the
 * off-screen approach can be hit but never held.
 *
 * The failure this prevents is a soft-lock, which is the worst class a wave
 * game has: a Deep-Freeze aura reaching a lane's off-screen approach freezes a
 * flyer where ground-only towers cannot see it and the hero's margin clamp
 * cannot reach it — the wave never ends. Found at 12/12 stalls by two
 * experimental plots near a west approach.
 */

function fixture(): SimData {
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
  return {
    enemies,
    map: makeMap({ laneWaypoints: [{ x: 50, y: -60 }, { x: 50, y: 100 }] }),
    waveSet,
    hero: TEST_HERO,
    economy: TEST_ECONOMY,
    towers: makeTowersFile(),
    abilities: [],
  };
}

describe('spawn-approach guard', () => {
  it('an enemy on the off-screen approach can be hit but never held', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    const e = sim.enemySystem.spawn('walker', 'main', 1);
    expect(e.y).toBeLessThan(0); // still on the approach
    sim.enemySystem.applySlow(e.id, 0, 5);
    expect(e.slowRemaining).toBe(0); // refused — no hold off-screen

    while (e.y < 0) sim.enemySystem.tick(SIM_DT);
    sim.enemySystem.applySlow(e.id, 0, 5);
    expect(e.slowRemaining).toBeGreaterThan(0); // on the field, slows work
  });

  it('unbounded engine fixtures are unaffected', () => {
    // Systems built without a Simulation never call setWorldBounds; the guard
    // must default to off rather than silently disabling slows everywhere.
    const data = fixture();
    data.map = makeMap(); // default lane starts on-map at (0,0)
    const sim = new Simulation(data, TEST_RNG);
    const e = sim.enemySystem.spawn('walker', 'main', 1);
    sim.enemySystem.applySlow(e.id, 0.5, 5);
    expect(e.slowRemaining).toBeGreaterThan(0);
  });
});
