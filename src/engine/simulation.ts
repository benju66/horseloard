import type { EnemiesFile, MapDef, WaveSet } from '../data/schemas';
import { IdGenerator } from './ids';
import { buildLanePaths, type LanePath } from './path';
import { EnemySystem } from './enemySystem';
import { WaveRunner } from './waveRunner';

/** Fixed simulation timestep. Rendering framerate is unrelated (CLAUDE.md #2). */
export const SIM_DT = 1 / 60;

/** Longest real-time delta we'll simulate per advance() — guards the spiral of death after tab-switches. */
const MAX_FRAME = 0.25;

export interface SimData {
  enemies: EnemiesFile;
  map: MapDef;
  waveSet: WaveSet;
}

/**
 * 'build' — between waves, player spends and positions
 * 'wave'  — spawning/fighting; ends when spawning is done and no enemy is
 *           still walking (at-end enemies persist — they're a siege, not a score)
 * 'done'  — all waves cleared
 */
export type SimPhase = 'build' | 'wave' | 'done';

/**
 * The whole game state advances here, in fixed ticks, with no reference to
 * Phaser or wall-clock time. Scenes call advance(elapsed) and read state.
 */
export class Simulation {
  readonly ids = new IdGenerator();
  readonly lanes: Map<string, LanePath>;
  readonly enemySystem: EnemySystem;
  readonly waveRunner: WaveRunner;

  phase: SimPhase = 'build';
  tickCount = 0;
  private accumulator = 0;

  constructor(data: SimData) {
    this.lanes = buildLanePaths(data.map);
    this.enemySystem = new EnemySystem(data.enemies.enemies, this.lanes, this.ids);
    this.waveRunner = new WaveRunner(data.waveSet, (enemyId, laneId, hpMultiplier) => {
      this.enemySystem.spawn(enemyId, laneId, hpMultiplier);
    });
  }

  /** Elapsed real seconds in, fixed ticks out. Returns the number of ticks executed. */
  advance(deltaSeconds: number): number {
    this.accumulator += Math.min(deltaSeconds, MAX_FRAME);
    let ticks = 0;
    while (this.accumulator >= SIM_DT) {
      this.accumulator -= SIM_DT;
      this.tick();
      ticks++;
    }
    return ticks;
  }

  tick(): void {
    this.tickCount++;
    if (this.phase === 'wave') this.waveRunner.tick(SIM_DT);
    this.enemySystem.tick(SIM_DT); // at-end enemies persist across phases (siege groundwork, M0.6)
    if (
      this.phase === 'wave' &&
      !this.waveRunner.spawning &&
      this.enemySystem.walkingCount === 0
    ) {
      this.phase = this.waveRunner.hasMoreWaves ? 'build' : 'done';
    }
  }

  startNextWave(): boolean {
    if (this.phase !== 'build') return false;
    if (!this.waveRunner.startNextWave()) return false;
    this.phase = 'wave';
    return true;
  }
}
