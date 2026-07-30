import type { Economy, EnemiesFile, Hero, MapDef, TowersFile, WaveSet } from '../data/schemas';
import { IdGenerator } from './ids';
import { buildLanePaths, type LanePath } from './path';
import { EnemySystem } from './enemySystem';
import { WaveRunner } from './waveRunner';
import { ProjectileSystem } from './projectileSystem';
import { HeroSystem } from './heroSystem';
import { EconomySystem } from './economySystem';
import { TowerSystem } from './towerSystem';

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
  towers: TowersFile;
}

/**
 * 'build' — between waves, player spends and positions
 * 'wave'  — spawning/fighting; ends when spawning is done and no enemy is
 *           still walking (at-end enemies persist — they're a siege, not a score)
 * 'done'  — all waves cleared AND the field fully cleaned up
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
  readonly economy: EconomySystem;
  readonly towerSystem: TowerSystem;

  phase: SimPhase = 'build';
  kills = 0;
  tickCount = 0;
  private accumulator = 0;

  constructor(data: SimData, rng: () => number = Math.random) {
    this.lanes = buildLanePaths(data.map);
    this.enemySystem = new EnemySystem(data.enemies.enemies, this.lanes, this.ids);
    this.waveRunner = new WaveRunner(data.waveSet, (enemyId, laneId, hpMultiplier) => {
      this.enemySystem.spawn(enemyId, laneId, hpMultiplier);
    });
    this.projectileSystem = new ProjectileSystem(this.enemySystem);
    this.hero = new HeroSystem(data.hero, data.map, this.enemySystem, this.projectileSystem);
    this.economy = new EconomySystem(data.economy, rng);
    this.towerSystem = new TowerSystem(
      data.towers,
      data.map.plots,
      this.enemySystem,
      this.projectileSystem,
    );

    // Kills drop coins where the enemy died — the loot line is the gameplay.
    this.enemySystem.onDeath.push((e) => {
      this.kills++;
      this.economy.spawnCoins(e.x, e.y, e.config.coinValue);
    });
  }

  get gold(): number {
    return this.economy.gold;
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
    this.towerSystem.tick(SIM_DT);
    this.hero.tick(SIM_DT);
    this.projectileSystem.tick(SIM_DT);
    this.economy.tick(SIM_DT, this.hero.x, this.hero.y, this.phase === 'wave');

    if (
      this.phase === 'wave' &&
      !this.waveRunner.spawning &&
      this.enemySystem.walkingCount === 0
    ) {
      this.onWaveCleared();
    }
  }

  private onWaveCleared(): void {
    const { base, perWave } = this.economy.config.waveClearBonus;
    this.economy.gold += base + perWave * this.waveRunner.waveNumber;
    this.economy.sweep();
    this.phase = this.waveRunner.hasMoreWaves ? 'build' : 'done';
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
    if (cost === null || !this.economy.spend(cost)) return false;
    this.hero.upgradeBow();
    return true;
  }

  buildTower(plotId: string, towerId: string): boolean {
    const cost = this.towerSystem.buildCost(towerId);
    const plot = this.towerSystem.getPlot(plotId);
    if (cost === null || !plot || plot.towerId !== null) return false;
    if (!this.economy.spend(cost)) return false;
    return this.towerSystem.build(plotId, towerId);
  }

  upgradeTower(plotId: string): boolean {
    const plot = this.towerSystem.getPlot(plotId);
    if (!plot) return false;
    const cost = this.towerSystem.upgradeCost(plot);
    if (cost === null || !this.economy.spend(cost)) return false;
    return this.towerSystem.upgrade(plotId);
  }

  branchTower(plotId: string, branchId: string): boolean {
    const plot = this.towerSystem.getPlot(plotId);
    if (!plot) return false;
    const option = this.towerSystem.branchOptions(plot).find((b) => b.id === branchId);
    if (!option || !this.economy.spend(option.cost)) return false;
    return this.towerSystem.branch(plotId, branchId);
  }

  sellTower(plotId: string): boolean {
    const plot = this.towerSystem.getPlot(plotId);
    if (!plot || plot.towerId === null) return false;
    const refund = this.towerSystem.sell(plotId, this.economy.config.sellRefund);
    this.economy.gold += refund;
    return true;
  }
}
