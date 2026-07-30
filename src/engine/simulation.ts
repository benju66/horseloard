import type { Economy, EnemiesFile, Hero, MapDef, WaveSet } from '../data/schemas';
import { IdGenerator } from './ids';
import { buildLanePaths, type LanePath } from './path';
import { EnemySystem } from './enemySystem';
import { WaveRunner } from './waveRunner';
import { ProjectileSystem } from './projectileSystem';
import { HeroSystem } from './heroSystem';

/** Fixed simulation timestep. Rendering framerate is unrelated (CLAUDE.md #2). */
export const SIM_DT = 1 / 60;

/** Longest real-time delta we'll simulate per advance() — guards the spiral of death after tab-switches. */
const MAX_FRAME = 0.25;

export interface SimData {
  enemies: EnemiesFile;
  map: MapDef;
  waveSet: WaveSet;
  hero: Hero;
  economy: Economy;
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
  readonly projectileSystem: ProjectileSystem;
  readonly hero: HeroSystem;

  phase: SimPhase = 'build';
  gold: number;
  tickCount = 0;
  private accumulator = 0;

  constructor(data: SimData) {
    this.lanes = buildLanePaths(data.map);
    this.enemySystem = new EnemySystem(data.enemies.enemies, this.lanes, this.ids);
    this.waveRunner = new WaveRunner(data.waveSet, (enemyId, laneId, hpMultiplier) => {
      this.enemySystem.spawn(enemyId, laneId, hpMultiplier);
    });
    this.projectileSystem = new ProjectileSystem(this.enemySystem);
    this.hero = new HeroSystem(data.hero, data.map, this.enemySystem, this.projectileSystem);
    this.gold = data.economy.startingGold;

    // M0.4 placeholder: kills pay straight into gold. M0.5 replaces this with
    // dropped coin entities + magnet + expiry (the loot line IS the gameplay).
    this.enemySystem.onDeath.push((e) => {
      this.gold += e.config.coinValue;
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
    this.hero.tick(SIM_DT);
    this.projectileSystem.tick(SIM_DT);
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

  /** Forge purchase: spend gold for the next bow level. Returns false if unaffordable or maxed. */
  buyBowUpgrade(): boolean {
    const cost = this.hero.nextBowCost();
    if (cost === null || this.gold < cost) return false;
    this.gold -= cost;
    this.hero.upgradeBow();
    return true;
  }
}
