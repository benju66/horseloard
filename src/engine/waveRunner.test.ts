import { describe, expect, it } from 'vitest';
import { WaveRunner } from './waveRunner';
import type { WaveSet } from '../data/schemas';

const DT = 1 / 60;

interface Recorded {
  time: number;
  enemyId: string;
  laneId: string;
  hpMultiplier: number;
}

/** Drive a runner tick-by-tick, recording spawn times from the sim clock. */
function run(waveSet: WaveSet, seconds: number): { spawns: Recorded[]; runner: WaveRunner } {
  const spawns: Recorded[] = [];
  let clock = 0;
  const runner = new WaveRunner(waveSet, (enemyId, laneId, hpMultiplier) => {
    spawns.push({ time: clock, enemyId, laneId, hpMultiplier });
  });
  runner.startNextWave();
  const ticks = Math.ceil(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    clock += DT;
    runner.tick(DT);
  }
  return { spawns, runner };
}

function waveSet(waves: WaveSet['waves']): WaveSet {
  return { mapId: 'test-map', waves };
}

describe('WaveRunner', () => {
  it('spawns count enemies at delay + k*spacing', () => {
    const { spawns } = run(
      waveSet([
        {
          hpMultiplier: 1,
          entries: [{ enemyId: 'grunt', count: 3, spacing: 1, laneId: 'main', delay: 0.5 }],
        },
      ]),
      5,
    );
    expect(spawns).toHaveLength(3);
    const expected = [0.5, 1.5, 2.5];
    spawns.forEach((s, i) => {
      expect(s.time).toBeGreaterThanOrEqual(expected[i]! - 1e-6);
      expect(s.time).toBeLessThanOrEqual(expected[i]! + DT + 1e-6);
    });
  });

  it('interleaves overlapping entries by time', () => {
    const { spawns } = run(
      waveSet([
        {
          hpMultiplier: 1,
          entries: [
            { enemyId: 'grunt', count: 3, spacing: 1, laneId: 'main', delay: 0 },
            { enemyId: 'runner', count: 2, spacing: 1, laneId: 'main', delay: 0.5 },
          ],
        },
      ]),
      5,
    );
    expect(spawns.map((s) => s.enemyId)).toEqual([
      'grunt', // 0.0
      'runner', // 0.5
      'grunt', // 1.0
      'runner', // 1.5
      'grunt', // 2.0
    ]);
  });

  it('spacing 0 spawns the whole entry on one tick', () => {
    const { spawns } = run(
      waveSet([
        {
          hpMultiplier: 1,
          entries: [{ enemyId: 'swarm', count: 8, spacing: 0, laneId: 'main', delay: 1 }],
        },
      ]),
      2,
    );
    expect(spawns).toHaveLength(8);
    const times = new Set(spawns.map((s) => s.time));
    expect(times.size).toBe(1);
  });

  it('passes the wave hpMultiplier through to every spawn', () => {
    const { spawns } = run(
      waveSet([
        {
          hpMultiplier: 2.19,
          entries: [{ enemyId: 'brute', count: 2, spacing: 0.5, laneId: 'main', delay: 0 }],
        },
      ]),
      2,
    );
    expect(spawns.map((s) => s.hpMultiplier)).toEqual([2.19, 2.19]);
  });

  it('tracks wave progression and spawn completion', () => {
    const ws = waveSet([
      { hpMultiplier: 1, entries: [{ enemyId: 'a', count: 1, spacing: 1, laneId: 'l', delay: 0 }] },
      { hpMultiplier: 1, entries: [{ enemyId: 'b', count: 1, spacing: 1, laneId: 'l', delay: 0 }] },
    ]);
    const runner = new WaveRunner(ws, () => {});
    expect(runner.waveNumber).toBe(0);
    expect(runner.totalWaves).toBe(2);
    expect(runner.hasMoreWaves).toBe(true);

    expect(runner.startNextWave()).toBe(true);
    expect(runner.waveNumber).toBe(1);
    expect(runner.spawning).toBe(true);
    runner.tick(DT); // first event fires at t<=dt
    expect(runner.spawning).toBe(false);

    expect(runner.startNextWave()).toBe(true);
    expect(runner.waveNumber).toBe(2);
    expect(runner.hasMoreWaves).toBe(false);
    expect(runner.startNextWave()).toBe(false);
  });
});
