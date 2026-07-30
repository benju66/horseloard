import type { Wave, WaveSet } from '../data/schemas';

export type SpawnFn = (enemyId: string, laneId: string, hpMultiplier: number) => void;

interface SpawnEvent {
  time: number;
  enemyId: string;
  laneId: string;
  hpMultiplier: number;
}

const EPSILON = 1e-9;

/**
 * Turns authored wave JSON into timed spawns. Each entry expands to
 * `count` events at delay + k*spacing; entries interleave via their delays.
 * The schedule is built once per wave start — the tick path allocates nothing.
 */
export class WaveRunner {
  private readonly waveSet: WaveSet;
  private readonly spawnFn: SpawnFn;
  private events: SpawnEvent[] = [];
  private cursor = 0;
  private clock = 0;
  private waveIndex = -1; // index into waveSet.waves; -1 = none started

  constructor(waveSet: WaveSet, spawnFn: SpawnFn) {
    this.waveSet = waveSet;
    this.spawnFn = spawnFn;
  }

  /** 1-based wave number for display; 0 before the first wave. */
  get waveNumber(): number {
    return this.waveIndex + 1;
  }

  get totalWaves(): number {
    return this.waveSet.waves.length;
  }

  /** The wave currently running (or last run); null before the first start. */
  get currentWaveData(): Wave | null {
    return this.waveSet.waves[this.waveIndex] ?? null;
  }

  get hasMoreWaves(): boolean {
    return this.waveIndex + 1 < this.waveSet.waves.length;
  }

  /** True while this wave still has spawns pending. */
  get spawning(): boolean {
    return this.cursor < this.events.length;
  }

  /** Endless mode appends generated waves on the same schema. */
  appendWave(wave: Wave): void {
    this.waveSet.waves.push(wave);
  }

  startNextWave(): boolean {
    if (!this.hasMoreWaves) return false;
    this.waveIndex++;
    const wave = this.waveSet.waves[this.waveIndex]!;
    this.events = [];
    for (const entry of wave.entries) {
      for (let k = 0; k < entry.count; k++) {
        this.events.push({
          time: entry.delay + k * entry.spacing,
          enemyId: entry.enemyId,
          laneId: entry.laneId,
          hpMultiplier: wave.hpMultiplier,
        });
      }
    }
    this.events.sort((a, b) => a.time - b.time);
    this.cursor = 0;
    this.clock = 0;
    return true;
  }

  tick(dt: number): void {
    if (!this.spawning) return;
    this.clock += dt;
    while (this.cursor < this.events.length) {
      const ev = this.events[this.cursor]!;
      if (ev.time > this.clock + EPSILON) break;
      this.cursor++;
      this.spawnFn(ev.enemyId, ev.laneId, ev.hpMultiplier);
    }
  }
}
