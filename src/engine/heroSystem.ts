import type { Hero, MapDef } from '../data/schemas';
import type { EnemyInstance, EnemySystem } from './enemySystem';
import type { ProjectileDef, ProjectileSystem } from './projectileSystem';

const INPUT_DEADZONE = 0.08; // prototype: ignore joystick magnitudes below this
const BOW_MUZZLE_OFFSET_Y = -22; // arrows leave from the rider, not the hooves

export interface HeroInput {
  x: number;
  y: number;
}

/** Hero stats a timed ability buff may multiply. Mirrors the ability schema. */
export type HeroBuffStat = 'bowDamage' | 'bowFireRate' | 'moveSpeed';

/**
 * The commander on the field. Cannot die; heavies shove and briefly stagger
 * instead (DESIGN §4). Consumes hero.json — no balance constants live here.
 */
export class HeroSystem {
  private readonly config: Hero;
  private readonly enemies: EnemySystem;
  private readonly projectiles: ProjectileSystem;
  private readonly minX: number;
  private readonly maxX: number;
  private readonly minY: number;
  private readonly maxY: number;

  /** normalized move vector, |v| <= 1; set by the input layer before each advance */
  readonly input: HeroInput = { x: 0, y: 0 };

  x: number;
  y: number;
  /** horizontal mirror for a 2D sprite renderer: 1 = right, -1 = left */
  dir: 1 | -1 = 1;
  /**
   * True heading — the normalised direction the hero last actually travelled.
   *
   * `dir` cannot serve this purpose: it is a left/right mirror flag derived
   * from horizontal input alone, so anything that steers by it can only ever
   * go due-left or due-right. Charge did exactly that, which made steering up
   * and charging send you sideways at full speed. Defaults to +y, the
   * direction the lane runs.
   */
  headingX = 0;
  headingY = 1;
  /** true while the player is actively steering (drives the gallop bob + trample) */
  moving = false;
  bowLevel = 1;
  private fireCooldown = 0;
  private controlLossRemaining = 0;
  private shoveVx = 0;
  private shoveVy = 0;

  private time = 0;
  private readonly trampleReadyAt = new Map<number, number>();
  private readonly staggerReadyAt = new Map<number, number>();
  private readonly bowProjectile: ProjectileDef;

  /**
   * Timed multipliers from `hero-buff` abilities, keyed by the stat they touch.
   *
   * Read at the moment of use rather than baked in, so a buff that expires
   * mid-draw simply stops applying. This is where the hero's burst shape lives:
   * a multiplier that only exists for `duration` out of every `cooldown` has a
   * hard ceiling on sustained output (TRIANGLE.md §B.3), which is precisely
   * what the bow curve did not.
   */
  private readonly buffs = new Map<HeroBuffStat, { multiplier: number; remaining: number }>();

  /** Charge ability: gallop burst, boosted trample, stagger immunity (the escape tool). */
  private chargeRemaining = 0;
  private charge: {
    speedMultiplier: number;
    damage: number;
    slowMultiplier: number;
    slowDuration: number;
  } | null = null;

  readonly onStagger: Array<(by: EnemyInstance) => void> = [];
  readonly onTrample: Array<(target: EnemyInstance) => void> = [];

  constructor(config: Hero, map: MapDef, enemies: EnemySystem, projectiles: ProjectileSystem) {
    this.config = config;
    this.enemies = enemies;
    this.projectiles = projectiles;
    this.x = map.heroSpawn.x;
    this.y = map.heroSpawn.y;
    this.minX = config.margins.x;
    this.maxX = map.world.width - config.margins.x;
    this.minY = config.margins.top;
    this.maxY = map.world.height - config.margins.bottom;
    this.bowProjectile = {
      behavior: 'ballistic',
      speed: config.bow.projectile.speed,
      ignoresArmor: config.bow.projectile.ignoresArmor,
    };

    // Per-enemy cooldowns must not leak entries: forget enemies when they die.
    enemies.onDeath.push((e) => {
      this.trampleReadyAt.delete(e.id);
      this.staggerReadyAt.delete(e.id);
    });
  }

  get staggered(): boolean {
    return this.controlLossRemaining > 0;
  }

  get charging(): boolean {
    return this.chargeRemaining > 0;
  }

  activateCharge(effect: {
    duration: number;
    speedMultiplier: number;
    damage: number;
    slowMultiplier: number;
    slowDuration: number;
  }): void {
    this.chargeRemaining = effect.duration;
    this.charge = effect;
    this.controlLossRemaining = 0; // charging breaks an active shove — it's the escape tool
  }

  get bowStats() {
    return this.config.bow.levels[this.bowLevel - 1]!;
  }

  /** Current multiplier on a buffable stat; 1 when nothing is active. */
  buffFactor(stat: HeroBuffStat): number {
    return this.buffs.get(stat)?.multiplier ?? 1;
  }

  /** Seconds left on a buff, 0 when inactive — the HUD reads this. */
  buffRemaining(stat: HeroBuffStat): number {
    return this.buffs.get(stat)?.remaining ?? 0;
  }

  /**
   * Apply a timed buff. Re-casting refreshes rather than stacking: stacking
   * would let a short cooldown compound into the sustain this whole design is
   * built to prevent.
   */
  applyBuff(stat: HeroBuffStat, multiplier: number, duration: number): void {
    const existing = this.buffs.get(stat);
    if (existing && existing.multiplier >= multiplier) {
      existing.remaining = Math.max(existing.remaining, duration);
      return;
    }
    this.buffs.set(stat, { multiplier, remaining: duration });
  }

  get maxBowLevel(): number {
    return this.config.bow.levels.length;
  }

  /** Cost of the next bow level, or null at max. */
  nextBowCost(): number | null {
    const next = this.config.bow.levels[this.bowLevel];
    return next ? next.cost : null;
  }

  /** Called by the economy layer after the gold check passes. */
  upgradeBow(): void {
    if (this.bowLevel < this.maxBowLevel) this.bowLevel++;
  }

  tick(dt: number): void {
    this.time += dt;
    for (const [stat, buff] of this.buffs) {
      buff.remaining -= dt;
      if (buff.remaining <= 0) this.buffs.delete(stat);
    }
    if (this.chargeRemaining > 0) {
      this.chargeRemaining -= dt;
      if (this.chargeRemaining < 1e-9) this.chargeRemaining = 0;
    }
    this.move(dt);
    this.resolveContacts();
    this.autoFire(dt);
  }

  private move(dt: number): void {
    if (this.staggered) {
      this.controlLossRemaining -= dt;
      if (this.controlLossRemaining < 1e-9) this.controlLossRemaining = 0; // snap float residue
      this.x += this.shoveVx * dt;
      this.y += this.shoveVy * dt;
      this.moving = false;
    } else {
      let mx = this.input.x;
      let my = this.input.y;
      let m = Math.hypot(mx, my);
      if (this.charging && m <= INPUT_DEADZONE) {
        // Burst continues along the true heading with a loose stick. This used
        // to use `dir`, which is a left/right mirror flag — so charging after
        // steering upward launched you sideways.
        mx = this.headingX;
        my = this.headingY;
        m = 1;
      }
      if (m > INPUT_DEADZONE) {
        if (m > 1) {
          mx /= m;
          my /= m;
        }
        const speed =
          this.config.moveSpeed *
          this.buffFactor('moveSpeed') *
          (this.charging ? this.charge!.speedMultiplier : 1);
        this.x += mx * speed * dt;
        this.y += my * speed * dt;
        this.headingX = mx;
        this.headingY = my;
        if (Math.abs(mx) > 0.1) this.dir = mx > 0 ? 1 : -1;
        this.moving = true;
      } else {
        this.moving = false;
      }
    }
    this.x = Math.min(this.maxX, Math.max(this.minX, this.x));
    this.y = Math.min(this.maxY, Math.max(this.minY, this.y));
  }

  private resolveContacts(): void {
    const list = this.enemies.enemies;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]!;
      const reach = this.config.radius + e.config.radius;
      const dx = this.x - e.x;
      const dy = this.y - e.y;
      if (dx * dx + dy * dy > reach * reach) continue;

      // No chain-staggers; a charging hero is immune — Charge is the escape tool (DESIGN §4).
      if (
        !this.staggered &&
        !this.charging &&
        e.config.staggersHero &&
        (this.staggerReadyAt.get(e.id) ?? 0) <= this.time
      ) {
        this.staggerReadyAt.set(e.id, this.time + this.config.stagger.perEnemyCooldown);
        const dist = Math.hypot(dx, dy) || 1;
        const shoveSpeed = this.config.stagger.shoveDistance / this.config.stagger.controlLossDuration;
        this.shoveVx = (dx / dist) * shoveSpeed;
        this.shoveVy = (dy / dist) * shoveSpeed;
        this.controlLossRemaining = this.config.stagger.controlLossDuration;
        for (const fn of this.onStagger) fn(e);
      } else if (this.moving && (this.trampleReadyAt.get(e.id) ?? 0) <= this.time) {
        this.trampleReadyAt.set(e.id, this.time + this.config.trample.perEnemyCooldown);
        for (const fn of this.onTrample) fn(e);
        if (this.charging && this.charge) {
          this.enemies.applySlow(e.id, this.charge.slowMultiplier, this.charge.slowDuration);
          this.enemies.applyDamage(e.id, this.charge.damage, this.x, this.y);
        } else {
          this.enemies.applyDamage(e.id, this.config.trample.damage, this.x, this.y);
        }
      }
    }
  }

  private autoFire(dt: number): void {
    this.fireCooldown -= dt;
    if (this.fireCooldown > 0) return;
    const stats = this.bowStats;
    const target = this.nearestEnemyWithin(stats.range);
    if (!target) return;
    this.projectiles.spawn(
      this.x,
      this.y + BOW_MUZZLE_OFFSET_Y,
      target.id,
      stats.damage * this.buffFactor('bowDamage'),
      this.bowProjectile,
      true,
    );
    this.fireCooldown = stats.fireInterval / this.buffFactor('bowFireRate');
  }

  private nearestEnemyWithin(range: number): EnemyInstance | null {
    let best: EnemyInstance | null = null;
    let bestSq = range * range;
    for (const e of this.enemies.enemies) {
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestSq) {
        bestSq = dSq;
        best = e;
      }
    }
    return best;
  }
}
