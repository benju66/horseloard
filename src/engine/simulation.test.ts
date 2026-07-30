import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile, WaveSet } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, makeEnemy, makeMap } from './testFixtures';

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
  return { enemies, map: makeMap(), waveSet, hero: TEST_HERO, economy: TEST_ECONOMY };
}

function advanceSeconds(sim: Simulation, seconds: number): void {
  const ticks = Math.round(seconds / SIM_DT);
  for (let i = 0; i < ticks; i++) sim.tick();
}

describe('fixed-timestep accumulator', () => {
  it('converts elapsed time into whole ticks and carries the remainder', () => {
    const sim = new Simulation(fixture());
    expect(sim.advance(SIM_DT)).toBe(1);
    expect(sim.advance(SIM_DT * 2.5)).toBe(2);
    expect(sim.advance(SIM_DT * 0.6)).toBe(1); // ~0.5 carried + 0.6 = 1 tick, safely past the boundary
    expect(sim.tickCount).toBe(4);
  });

  it('clamps huge deltas (tab-switch) instead of spiraling', () => {
    const sim = new Simulation(fixture());
    expect(sim.advance(10)).toBe(15); // MAX_FRAME 0.25s = 15 ticks
  });

  it('is deterministic: same ticks, same state', () => {
    const a = new Simulation(fixture());
    const b = new Simulation(fixture());
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
    const sim = new Simulation(fixture());
    sim.startNextWave();
    advanceSeconds(sim, 2); // spawn at ~0s, walk ~2s at speed 10
    const first = sim.enemySystem.enemies.find((e) => e.id === 1)!;
    expect(first.distance).toBeCloseTo(20, 0);
    expect(first.x).toBe(0);
    expect(first.y).toBeCloseTo(20, 0);
    expect(first.state).toBe('walking');
  });

  it('assigns stable sequential ids', () => {
    const sim = new Simulation(fixture());
    sim.startNextWave();
    advanceSeconds(sim, 2);
    expect(sim.enemySystem.enemies.map((e) => e.id).sort()).toEqual([1, 2]);
    expect(sim.enemySystem.getById(1)!.config.id).toBe('walker');
  });

  it('leaks never despawn: reaching the end parks the enemy, alive', () => {
    const sim = new Simulation(fixture());
    sim.startNextWave();
    const reached: number[] = [];
    sim.enemySystem.onReachEnd.push((e) => reached.push(e.id));
    advanceSeconds(sim, 15); // lane is 100 long, speed 10 → ends by ~11s
    expect(sim.enemySystem.aliveCount).toBe(2);
    expect(reached.sort()).toEqual([1, 2]);
    for (const e of sim.enemySystem.enemies) {
      expect(e.state).toBe('at-end');
      expect(e.distance).toBe(100);
      expect(e.y).toBe(100);
    }
    // wave is over (nothing still walking) but the leaks remain
    expect(sim.phase).toBe('done');
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

  it('applyDamage kills at 0 and removes the enemy', () => {
    const sim = new Simulation(fixture());
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
