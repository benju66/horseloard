import type { Plot, Projectile, TargetingMode, Tower, TowerBranch, TowerStats, TowersFile } from '../data/schemas';
import type { EnemyInstance, EnemySystem } from './enemySystem';
import type { ProjectileSystem } from './projectileSystem';

export interface PlotState {
  readonly plotId: string;
  readonly x: number;
  readonly y: number;
  /** null = empty plot */
  towerId: string | null;
  /** 1–3 on the level track; 4 = branched */
  level: number;
  branchId: string | null;
  /** total coins ever spent on this instance — sell refunds a fraction of this */
  invested: number;
  cooldown: number;
}

/**
 * One engine for every tower, forever. Consumes towers.json — if this file
 * ever names a tower, that's a bug (CLAUDE.md #1). Tower #5 must be a JSON
 * entry + assets, zero edits here.
 */
export class TowerSystem {
  private readonly towersById = new Map<string, Tower>();
  private readonly projectilesById = new Map<string, Projectile>();
  private readonly plotList: PlotState[] = [];
  private readonly plotsById = new Map<string, PlotState>();
  private readonly enemies: EnemySystem;
  private readonly projectiles: ProjectileSystem;

  constructor(file: TowersFile, plots: readonly Plot[], enemies: EnemySystem, projectiles: ProjectileSystem) {
    for (const p of file.projectiles) {
      if (p.behavior === 'aura') {
        throw new Error(`TowerSystem: projectile "${p.id}" uses "aura" — not implemented until M1 content needs it`);
      }
      this.projectilesById.set(p.id, p);
    }
    for (const t of file.towers) this.towersById.set(t.id, t);
    for (const p of plots) {
      const state: PlotState = {
        plotId: p.id,
        x: p.position.x,
        y: p.position.y,
        towerId: null,
        level: 0,
        branchId: null,
        invested: 0,
        cooldown: 0,
      };
      this.plotList.push(state);
      this.plotsById.set(p.id, state);
    }
    this.enemies = enemies;
    this.projectiles = projectiles;
  }

  /** The buildable roster, in file order. */
  get roster(): Tower[] {
    return [...this.towersById.values()];
  }

  get plots(): readonly PlotState[] {
    return this.plotList;
  }

  getPlot(plotId: string): PlotState | undefined {
    return this.plotsById.get(plotId);
  }

  getTower(towerId: string): Tower | undefined {
    return this.towersById.get(towerId);
  }

  /** Live combat stats for a built plot (level track or branch). */
  stats(plot: PlotState): TowerStats | null {
    const tower = plot.towerId ? this.towersById.get(plot.towerId) : undefined;
    if (!tower) return null;
    if (plot.branchId) {
      const branch = tower.branches.find((b) => b.id === plot.branchId);
      return branch ? branch.stats : null;
    }
    return tower.levels[plot.level - 1] ?? null;
  }

  buildCost(towerId: string): number | null {
    return this.towersById.get(towerId)?.levels[0]?.cost ?? null;
  }

  /** Cost of the next straight upgrade (levels 2–3), or null at the branch point / when branched. */
  upgradeCost(plot: PlotState): number | null {
    const tower = plot.towerId ? this.towersById.get(plot.towerId) : undefined;
    if (!tower || plot.branchId) return null;
    return tower.levels[plot.level]?.cost ?? null;
  }

  /** The Lv4 pair, offered when the level track is exhausted. */
  branchOptions(plot: PlotState): TowerBranch[] {
    const tower = plot.towerId ? this.towersById.get(plot.towerId) : undefined;
    if (!tower || plot.branchId) return [];
    return plot.level === tower.levels.length ? [...tower.branches] : [];
  }

  sellRefund(plot: PlotState, fraction: number): number {
    return Math.floor(plot.invested * fraction);
  }

  /** Mutations assume the gold check already passed (Simulation owns spending). */
  build(plotId: string, towerId: string): boolean {
    const plot = this.plotsById.get(plotId);
    const tower = this.towersById.get(towerId);
    const cost = this.buildCost(towerId);
    if (!plot || !tower || plot.towerId !== null || cost === null) return false;
    plot.towerId = towerId;
    plot.level = 1;
    plot.branchId = null;
    plot.invested = cost;
    plot.cooldown = 0;
    return true;
  }

  upgrade(plotId: string): boolean {
    const plot = this.plotsById.get(plotId);
    if (!plot) return false;
    const cost = this.upgradeCost(plot);
    if (cost === null) return false;
    plot.level++;
    plot.invested += cost;
    return true;
  }

  branch(plotId: string, branchId: string): boolean {
    const plot = this.plotsById.get(plotId);
    if (!plot) return false;
    const option = this.branchOptions(plot).find((b) => b.id === branchId);
    if (!option) return false;
    plot.level++;
    plot.branchId = branchId;
    plot.invested += option.cost;
    return true;
  }

  /** Returns the refund (0 if the plot was empty). Caller adds it to gold. */
  sell(plotId: string, refundFraction: number): number {
    const plot = this.plotsById.get(plotId);
    if (!plot || plot.towerId === null) return 0;
    const refund = this.sellRefund(plot, refundFraction);
    plot.towerId = null;
    plot.level = 0;
    plot.branchId = null;
    plot.invested = 0;
    plot.cooldown = 0;
    return refund;
  }

  tick(dt: number): void {
    for (const plot of this.plotList) {
      if (plot.towerId === null) continue;
      const tower = this.towersById.get(plot.towerId)!;
      if (tower.targeting === 'none') continue;
      plot.cooldown -= dt;
      if (plot.cooldown > 0) continue;
      const stats = this.stats(plot);
      if (!stats || stats.damage <= 0) continue;
      const target = this.acquire(tower.targeting, plot.x, plot.y, stats.range);
      if (!target) continue;
      const projectileId = this.projectileIdFor(tower, plot.branchId);
      const def = projectileId ? this.projectilesById.get(projectileId) : undefined;
      if (!def || def.behavior === 'aura') continue; // aura rejected at construction; narrows the type here
      this.projectiles.spawn(plot.x, plot.y - 26, target.id, stats.damage, def, false);
      plot.cooldown = stats.fireInterval;
    }
  }

  private projectileIdFor(tower: Tower, branchId: string | null): string | null {
    if (branchId) {
      const branch = tower.branches.find((b) => b.id === branchId);
      if (branch?.projectileId) return branch.projectileId;
    }
    return tower.projectileId;
  }

  private acquire(mode: TargetingMode, x: number, y: number, range: number): EnemyInstance | null {
    const rangeSq = range * range;
    let best: EnemyInstance | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies.enemies) {
      const dx = e.x - x;
      const dy = e.y - y;
      const dSq = dx * dx + dy * dy;
      if (dSq > rangeSq) continue;
      // Lower score wins: nearest = distance; first = furthest along the lane; strongest = most hp.
      const score = mode === 'nearest' ? dSq : mode === 'first' ? -e.distance : -e.hp;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }
}
