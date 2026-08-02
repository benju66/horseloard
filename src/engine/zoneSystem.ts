import type { EnemySystem } from './enemySystem';
import type { IdGenerator } from './ids';

/**
 * How often a zone actually deals its damage, in seconds.
 *
 * Damage is pulsed rather than applied every tick for two reasons. The renderer
 * subscribes to `onDamaged` to float damage numbers, and sixty of them a second
 * per enemy is unreadable noise; and a pulse is a thing a player can hear and
 * see, which is what makes a patch of ground legible as a hazard rather than as
 * a decal. The slow is *not* pulsed — it is refreshed every tick, so stepping
 * out of the patch stops slowing you almost immediately instead of up to half a
 * second later.
 */
const PULSE_INTERVAL = 0.5;

/** Slow refresh window — slightly longer than a tick so it never flickers off inside the zone. */
const SLOW_REFRESH = 0.15;

export interface ZoneSpec {
  readonly radius: number;
  readonly duration: number;
  readonly damagePerSecond: number;
  readonly slowMultiplier: number;
}

export interface GroundZone {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly damagePerSecond: number;
  readonly slowMultiplier: number;
  /** seconds left before the patch is spent */
  remaining: number;
  /** seconds until the next damage pulse */
  pulseIn: number;
}

/**
 * Persistent ground hazards — the only friendly thing in the sim that is neither
 * a unit nor a tower.
 *
 * Content-agnostic like everything else in `/src/engine`: it is handed a radius,
 * a duration and two numbers, and has never heard of caltrops or burning oil.
 * What drops a zone is the AbilitySystem's business; keeping the lifetime here
 * means a tower or a wave event could drop one later with no changes.
 */
export class ZoneSystem {
  private readonly enemies: EnemySystem;
  private readonly ids: IdGenerator;
  private readonly list: GroundZone[] = [];
  private readonly hits: number[] = [];

  readonly onSpawn: Array<(z: GroundZone) => void> = [];
  readonly onExpire: Array<(z: GroundZone) => void> = [];

  constructor(enemies: EnemySystem, ids: IdGenerator) {
    this.enemies = enemies;
    this.ids = ids;
  }

  spawn(x: number, y: number, spec: ZoneSpec): GroundZone {
    const zone: GroundZone = {
      id: this.ids.allocate(),
      x,
      y,
      radius: spec.radius,
      damagePerSecond: spec.damagePerSecond,
      slowMultiplier: spec.slowMultiplier,
      remaining: spec.duration,
      // First pulse lands on the next boundary rather than instantly, so a zone
      // dropped on top of a clump is not a disguised nuke — the whole point of
      // this ability is that it pays off over the seconds after you place it.
      pulseIn: PULSE_INTERVAL,
    };
    this.list.push(zone);
    for (const fn of this.onSpawn) fn(zone);
    return zone;
  }

  tick(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i]!;
      const rSq = z.radius * z.radius;

      const pulsing = (z.pulseIn -= dt) <= 0;
      if (pulsing) z.pulseIn += PULSE_INTERVAL;

      this.hits.length = 0;
      for (const e of this.enemies.enemies) {
        const dx = e.x - z.x;
        const dy = e.y - z.y;
        if (dx * dx + dy * dy > rSq) continue;
        if (z.slowMultiplier < 1) this.enemies.applySlow(e.id, z.slowMultiplier, SLOW_REFRESH);
        if (pulsing && z.damagePerSecond > 0) this.hits.push(e.id);
      }
      // Collected first, applied second: `applyDamage` can remove an enemy, and
      // EnemySystem swap-removes, so killing mid-iteration would skip whoever
      // got swapped into the dead index.
      const damage = z.damagePerSecond * PULSE_INTERVAL;
      for (const id of this.hits) this.enemies.applyDamage(id, damage);

      z.remaining -= dt;
      if (z.remaining <= 0) {
        const last = this.list[this.list.length - 1]!;
        this.list[i] = last;
        this.list.pop();
        for (const fn of this.onExpire) fn(z);
      }
    }
  }

  /** Live zones, unordered (swap-remove). Do not mutate. */
  get zones(): readonly GroundZone[] {
    return this.list;
  }
}
