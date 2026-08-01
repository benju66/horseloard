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
  /** seconds until the next income drop (economy towers) */
  incomeCooldown: number;
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
  private readonly rng: () => number;

  /** Rally Horn: global fire-rate multiplier while remaining > 0 */
  private rateBuffMultiplier = 1;
  private rateBuffRemaining = 0;
  private time = 0;
  private readonly breakReadyAt = new Map<string, number>();

  /** Economy towers drop coins beside themselves; the sim routes this to the EconomySystem. */
  readonly onIncome: Array<(x: number, y: number, value: number) => void> = [];
  /** Aura pulse fired (for rendering) */
  readonly onAuraPulse: Array<(plot: PlotState, radius: number) => void> = [];
  /** A towerBreak enemy stomped this plot down a level (null tower = destroyed outright) */
  readonly onTowerBroken: Array<(plot: PlotState) => void> = [];

  constructor(
    file: TowersFile,
    plots: readonly Plot[],
    enemies: EnemySystem,
    projectiles: ProjectileSystem,
    rng: () => number = Math.random,
  ) {
    for (const p of file.projectiles) this.projectilesById.set(p.id, p);
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
        incomeCooldown: 0,
      };
      this.plotList.push(state);
      this.plotsById.set(p.id, state);
    }
    this.enemies = enemies;
    this.projectiles = projectiles;
    this.rng = rng;
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

  /** The projectile def a built plot fires/pulses with (branch override wins). */
  projectileDef(plot: PlotState): Projectile | null {
    const tower = plot.towerId ? this.towersById.get(plot.towerId) : undefined;
    if (!tower) return null;
    const id = this.projectileIdFor(tower, plot.branchId);
    return id ? (this.projectilesById.get(id) ?? null) : null;
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
    plot.incomeCooldown = this.stats(plot)?.income?.interval ?? 0;
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
    plot.incomeCooldown = 0;
    return refund;
  }

  /** Rally Horn: every tower fires faster for a while. */
  applyRateBuff(multiplier: number, duration: number): void {
    this.rateBuffMultiplier = multiplier;
    this.rateBuffRemaining = duration;
  }

  get rateBuffActive(): boolean {
    return this.rateBuffRemaining > 0;
  }

  /** One level lost: branch pops first, level 1 loses the tower entirely. */
  downgrade(plotId: string): void {
    const plot = this.plotsById.get(plotId);
    if (!plot || plot.towerId === null) return;
    if (plot.branchId) {
      plot.branchId = null;
      plot.level--;
    } else if (plot.level > 1) {
      plot.level--;
    } else {
      plot.towerId = null;
      plot.level = 0;
      plot.invested = 0;
    }
    for (const fn of this.onTowerBroken) fn(plot);
  }

  tick(dt: number): void {
    this.time += dt;
    if (this.rateBuffRemaining > 0) this.rateBuffRemaining -= dt;

    // Tower breakers (the Warlord) stomp adjacent towers down a level.
    for (const e of this.enemies.enemies) {
      const brk = e.config.towerBreak;
      if (!brk) continue;
      for (const plot of this.plotList) {
        if (plot.towerId === null) continue;
        const dx = plot.x - e.x;
        const dy = plot.y - e.y;
        if (dx * dx + dy * dy > brk.radius * brk.radius) continue;
        if ((this.breakReadyAt.get(plot.plotId) ?? 0) > this.time) continue;
        this.breakReadyAt.set(plot.plotId, this.time + brk.cooldown);
        this.downgrade(plot.plotId);
      }
    }

    for (const plot of this.plotList) {
      if (plot.towerId === null) continue;
      const stats = this.stats(plot);
      if (!stats) continue;

      // Economy: drop coins beside the tower — ride by to scoop them.
      if (stats.income) {
        plot.incomeCooldown -= dt;
        if (plot.incomeCooldown <= 0) {
          plot.incomeCooldown = stats.income.interval;
          for (const fn of this.onIncome) fn(plot.x, plot.y, stats.income.value);
        }
      }

      const tower = this.towersById.get(plot.towerId)!;
      const def = this.projectileDef(plot);
      if (def?.behavior === 'aura') {
        this.tickAura(plot, stats, def, dt, tower.targetsFlying);
        continue;
      }

      if (tower.targeting === 'none') continue;
      plot.cooldown -= dt;
      if (plot.cooldown > 0) continue;
      if (!def || stats.damage <= 0) continue;
      const target = this.acquire(tower.targeting, plot.x, plot.y, stats.range, tower.targetsFlying);
      if (!target) continue;
      this.projectiles.spawn(plot.x, plot.y - 26, target.id, this.rollDamage(plot, stats), def, false);
      plot.cooldown = this.buffedInterval(stats.fireInterval);
    }
  }

  private tickAura(
    plot: PlotState,
    stats: TowerStats,
    def: Extract<Projectile, { behavior: 'aura' }>,
    dt: number,
    targetsFlying: boolean,
  ): void {
    plot.cooldown -= dt;
    if (plot.cooldown > 0) return;
    plot.cooldown = this.buffedInterval(def.tickInterval);
    for (const fn of this.onAuraPulse) fn(plot, def.radius);
    const rSq = def.radius * def.radius;
    const damage = this.rollDamage(plot, stats);
    // Slow first, then damage — Brittle's vulnerability applies to its own pulse.
    for (const e of this.enemies.enemies) {
      const dx = e.x - plot.x;
      const dy = e.y - plot.y;
      if (dx * dx + dy * dy > rSq) continue;
      if (e.config.flying && !targetsFlying) continue;
      if (def.slow) this.enemies.applySlow(e.id, def.slow.factor, def.slow.duration, def.vulnerability ?? 1);
    }
    if (damage > 0) {
      // Second pass with a snapshot-free loop is unsafe under removal; collect then apply.
      const hits: number[] = [];
      for (const e of this.enemies.enemies) {
        const dx = e.x - plot.x;
        const dy = e.y - plot.y;
        if (e.config.flying && !targetsFlying) continue;
        if (dx * dx + dy * dy <= rSq) hits.push(e.id);
      }
      for (const id of hits) this.enemies.applyDamage(id, damage); // auras ignore shield facing
    }
  }

  /** Crit roll (Sniper) × beacon auras from other plots (Beacon). */
  private rollDamage(plot: PlotState, stats: TowerStats): number {
    let damage = stats.damage;
    if (stats.crit && this.rng() < stats.crit.chance) damage *= stats.crit.multiplier;
    for (const other of this.plotList) {
      if (other === plot || other.towerId === null) continue;
      const aura = this.stats(other)?.towerAura;
      if (!aura) continue;
      const dx = plot.x - other.x;
      const dy = plot.y - other.y;
      if (dx * dx + dy * dy <= aura.radius * aura.radius) damage *= aura.damageMultiplier;
    }
    return damage;
  }

  private buffedInterval(interval: number): number {
    return this.rateBuffRemaining > 0 ? interval / this.rateBuffMultiplier : interval;
  }

  private projectileIdFor(tower: Tower, branchId: string | null): string | null {
    if (branchId) {
      const branch = tower.branches.find((b) => b.id === branchId);
      if (branch?.projectileId) return branch.projectileId;
    }
    return tower.projectileId;
  }

  private acquire(
    mode: TargetingMode,
    x: number,
    y: number,
    range: number,
    targetsFlying: boolean,
  ): EnemyInstance | null {
    const rangeSq = range * range;
    let best: EnemyInstance | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies.enemies) {
      // A ground-only tower cannot even see an airborne enemy, so it holds fire
      // rather than wasting its shot — the point of a hard counter is that the
      // tower has no answer, not a worse one.
      if (e.config.flying && !targetsFlying) continue;
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
