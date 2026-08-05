import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile, WaveSet } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';

/** Minimal fixture content — the engine must not care that none of it is real. */
function fixture(overrides?: { waves?: WaveSet['waves'] }): SimData {
  const enemies: EnemiesFile = {
    elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
    enemies: [makeEnemy({ id: 'walker', name: 'Walker' })],
  };
  const waveSet: WaveSet = {
    mapId: 'straight',
    waves: overrides?.waves ?? [
      {
        hpMultiplier: 1,
        entries: [{ enemyId: 'walker', count: 2, spacing: 1, laneId: 'main', delay: 0 }],
      },
    ],
  };
  return { enemies, map: makeMap(), waveSet, hero: TEST_HERO, economy: TEST_ECONOMY, towers: makeTowersFile() };
}

function advanceSeconds(sim: Simulation, seconds: number): void {
  const ticks = Math.round(seconds / SIM_DT);
  for (let i = 0; i < ticks; i++) sim.tick();
}

describe('fixed-timestep accumulator', () => {
  it('converts elapsed time into whole ticks and carries the remainder', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    expect(sim.advance(SIM_DT)).toBe(1);
    expect(sim.advance(SIM_DT * 2.5)).toBe(2);
    expect(sim.advance(SIM_DT * 0.6)).toBe(1); // ~0.5 carried + 0.6 = 1 tick, safely past the boundary
    expect(sim.tickCount).toBe(4);
  });

  it('clamps huge deltas (tab-switch) instead of spiraling', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    expect(sim.advance(10)).toBe(15); // MAX_FRAME 0.25s = 15 ticks
  });

  it('is deterministic: same ticks, same state', () => {
    const a = new Simulation(fixture(), TEST_RNG);
    const b = new Simulation(fixture(), TEST_RNG);
    a.startNextWave();
    b.startNextWave();
    advanceSeconds(a, 3);
    advanceSeconds(b, 3);
    expect(a.enemySystem.enemies.map((e) => ({ id: e.id, d: e.distance }))).toEqual(
      b.enemySystem.enemies.map((e) => ({ id: e.id, d: e.distance })),
    );
  });
});

describe('enemy movement along the lane', () => {
  it('walks at config speed and tracks world position', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.startNextWave();
    advanceSeconds(sim, 2); // spawn at ~0s, walk ~2s at speed 10
    const first = sim.enemySystem.enemies.find((e) => e.id === 1)!;
    expect(first.distance).toBeCloseTo(20, 0);
    expect(first.x).toBe(0);
    expect(first.y).toBeCloseTo(20, 0);
    expect(first.state).toBe('walking');
  });

  it('assigns stable sequential ids', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.startNextWave();
    advanceSeconds(sim, 2);
    expect(sim.enemySystem.enemies.map((e) => e.id).sort()).toEqual([1, 2]);
    expect(sim.enemySystem.getById(1)!.config.id).toBe('walker');
  });

  it('leaks never despawn: reaching the end turns walkers into besiegers', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.startNextWave();
    const reached: number[] = [];
    sim.enemySystem.onReachEnd.push((e) => reached.push(e.id));
    advanceSeconds(sim, 20); // lane is 100 long, speed 10 → ends ~11s; slot walk after
    expect(sim.enemySystem.aliveCount).toBe(2);
    expect(reached.sort()).toEqual([1, 2]);
    for (const e of sim.enemySystem.enemies) {
      expect(e.state).toBe('at-slot');
      expect(e.distance).toBe(100);
    }
    // final wave with a standing siege: no victory, and the gate is paying for it
    expect(sim.phase).toBe('wave');
    expect(sim.gate.besiegerCount).toBe(2);
    expect(sim.gate.hp).toBeLessThan(sim.gate.maxHp);
  });
});

describe('wave lifecycle', () => {
  it('build → wave → build across authored waves', () => {
    const sim = new Simulation(
      fixture({
        waves: [
          {
            hpMultiplier: 1,
            entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }],
          },
          {
            hpMultiplier: 3,
            entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }],
          },
        ],
      }),
    );
    expect(sim.phase).toBe('build');
    expect(sim.startNextWave()).toBe(true);
    expect(sim.phase).toBe('wave');
    expect(sim.startNextWave()).toBe(false); // can't start mid-wave

    advanceSeconds(sim, 1);
    expect(sim.enemySystem.aliveCount).toBe(1);
    sim.enemySystem.applyDamage(1, 999);
    advanceSeconds(sim, SIM_DT * 2);
    expect(sim.phase).toBe('build'); // cleared, more waves remain

    expect(sim.startNextWave()).toBe(true);
    advanceSeconds(sim, 1);
    const e2 = sim.enemySystem.enemies[0]!;
    expect(e2.maxHp).toBe(30); // hp 10 × wave hpMultiplier 3
    sim.enemySystem.applyDamage(e2.id, 999);
    advanceSeconds(sim, SIM_DT * 2);
    expect(sim.phase).toBe('done');
  });

  it('pays an early-start bonus that decays over the build phase', () => {
    const sim = new Simulation(
      fixture({
        waves: [
          {
            hpMultiplier: 1,
            entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }],
          },
          {
            hpMultiplier: 1,
            entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }],
          },
        ],
      }),
      TEST_RNG,
    );
    expect(sim.earlyStartBonus()).toBe(0); // nothing cleared yet
    sim.startNextWave();
    advanceSeconds(sim, 1);
    sim.enemySystem.applyDamage(1, 999);
    advanceSeconds(sim, SIM_DT * 2);
    expect(sim.phase).toBe('build');

    // instant restart: full bonus
    expect(sim.earlyStartBonus()).toBe(TEST_ECONOMY.earlyStart.maxBonus);
    const before = sim.gold;
    sim.startNextWave();
    expect(sim.gold).toBe(before + TEST_ECONOMY.earlyStart.maxBonus);
  });

  it('pays nothing for a slow start', () => {
    const sim = new Simulation(
      fixture({
        waves: [
          {
            hpMultiplier: 1,
            entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }],
          },
          {
            hpMultiplier: 1,
            entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }],
          },
        ],
      }),
      TEST_RNG,
    );
    sim.startNextWave();
    advanceSeconds(sim, 1);
    sim.enemySystem.applyDamage(1, 999);
    advanceSeconds(sim, TEST_ECONOMY.earlyStart.windowSeconds + 1); // dawdle past the window
    expect(sim.earlyStartBonus()).toBe(0);
    const before = sim.gold;
    sim.startNextWave();
    expect(sim.gold).toBe(before);
  });

  it('holds the night open while besiegers live — dawn only on a clear field', () => {
    const sim = new Simulation(
      fixture({
        waves: [
          { hpMultiplier: 1, entries: [{ enemyId: 'walker', count: 2, spacing: 1, laneId: 'main', delay: 0 }] },
          { hpMultiplier: 1, entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }] },
        ],
      }),
      TEST_RNG,
    );
    sim.startNextWave();
    advanceSeconds(sim, 20); // both walkers leak and besiege
    expect(sim.enemySystem.walkingCount).toBe(0);
    expect(sim.gate.besiegerCount).toBe(2);
    // Not the final wave — under the old rule this would already be 'build'.
    expect(sim.phase).toBe('wave');
    sim.enemySystem.applyDamage(1, 999);
    advanceSeconds(sim, SIM_DT * 2);
    expect(sim.phase).toBe('wave'); // one besieger still standing
    sim.enemySystem.applyDamage(2, 999);
    advanceSeconds(sim, SIM_DT * 2);
    expect(sim.phase).toBe('build'); // field clear, dawn breaks
  });

  it('reports zero gate damage for a clean hold', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    const reports: Array<{ wave: number; damage: number }> = [];
    sim.onWaveClear.push((wave, _xp, damageTaken) => reports.push({ wave, damage: damageTaken }));
    sim.startNextWave();
    advanceSeconds(sim, 1.5); // both spawned, nowhere near the gate
    sim.enemySystem.applyDamage(1, 999);
    sim.enemySystem.applyDamage(2, 999);
    advanceSeconds(sim, SIM_DT * 2);
    expect(reports).toEqual([{ wave: 1, damage: 0 }]);
  });

  it('reports the gate HP the wave actually cost', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    const damages: number[] = [];
    sim.onWaveClear.push((_w, _xp, damageTaken) => damages.push(damageTaken));
    sim.startNextWave();
    advanceSeconds(sim, 20); // walkers reach the gate and besiege it
    expect(sim.gate.hp).toBeLessThan(sim.gate.maxHp);
    sim.enemySystem.applyDamage(1, 999);
    sim.enemySystem.applyDamage(2, 999);
    advanceSeconds(sim, SIM_DT * 2);
    expect(damages).toHaveLength(1);
    expect(damages[0]).toBeGreaterThan(0);
    // No repair happened, so the report must equal the gate's actual loss.
    expect(damages[0]).toBeCloseTo(sim.gate.maxHp - sim.gate.hp, 5);
  });

  it('announces each species once, on first spawn, and never again', () => {
    const enemies: EnemiesFile = {
      elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
      enemies: [makeEnemy({ id: 'walker', name: 'Walker' }), makeEnemy({ id: 'newcomer', name: 'Newcomer' })],
    };
    const waveSet: WaveSet = {
      mapId: 'straight',
      waves: [
        { hpMultiplier: 1, entries: [{ enemyId: 'walker', count: 2, spacing: 0.5, laneId: 'main', delay: 0 }] },
        {
          hpMultiplier: 1,
          entries: [
            { enemyId: 'walker', count: 1, spacing: 0.5, laneId: 'main', delay: 0 },
            { enemyId: 'newcomer', count: 1, spacing: 0.5, laneId: 'main', delay: 0.5 },
          ],
        },
      ],
    };
    const sim = new Simulation(
      { enemies, map: makeMap(), waveSet, hero: TEST_HERO, economy: TEST_ECONOMY, towers: makeTowersFile() },
      TEST_RNG,
    );
    const sightings: string[] = [];
    sim.onFirstEncounter.push((id) => sightings.push(id));

    sim.startNextWave();
    advanceSeconds(sim, 2);
    expect(sightings).toEqual(['walker']); // two walkers, one announcement
    for (const e of [...sim.enemySystem.enemies]) sim.enemySystem.applyDamage(e.id, 999);
    advanceSeconds(sim, SIM_DT * 2);

    sim.startNextWave();
    advanceSeconds(sim, 2);
    expect(sightings).toEqual(['walker', 'newcomer']); // wave 2's walker is old news
    expect([...sim.encountered]).toEqual(['walker', 'newcomer']);
  });

  it('applyDamage kills at 0 and removes the enemy', () => {
    const sim = new Simulation(fixture(), TEST_RNG);
    sim.startNextWave();
    const deaths: number[] = [];
    sim.enemySystem.onDeath.push((e) => deaths.push(e.id));
    advanceSeconds(sim, 1.5); // both spawned
    expect(sim.enemySystem.applyDamage(1, 4)).toBe(false);
    expect(sim.enemySystem.getById(1)!.hp).toBe(6);
    expect(sim.enemySystem.applyDamage(1, 6)).toBe(true);
    expect(sim.enemySystem.getById(1)).toBeUndefined();
    expect(sim.enemySystem.aliveCount).toBe(1);
    expect(deaths).toEqual([1]);
    expect(sim.enemySystem.applyDamage(1, 5)).toBe(false); // already gone
  });
});
