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
  /**
   * Makes this zone circle a moving anchor instead of sitting still.
   *
   * Orbiting blades are the same hazard as a patch of caltrops — a radius that
   * hurts what stands in it — differing only in whether the radius stays put.
   * Modelling them as mobile zones rather than a third damage system means the
   * pulse cadence, the slow refresh and the swap-remove all come for free.
   */
  readonly orbit?: {
    readonly index: number;
    readonly count: number;
    readonly distance: number;
    readonly revolutionsPerSecond: number;
  };
}

export interface GroundZone {
  readonly id: number;
  x: number;
  y: number;
  /** set when this zone circles the hero rather than holding a fixed spot */
  readonly orbit: ZoneSpec['orbit'];
  /** radians travelled so far, for an orbiting zone */
  angle: number;
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
  /**
   * Rule `zones-strip-armor`: anything standing in your ground is unarmoured
   * while it stands there.
   *
   * The Storm path's answer to heavy enemies. It pays nothing on its own and a
   * great deal beside towers that were already struggling to chew armour, which
   * is the synergy shape a tree wants — worth building around, worthless as a
   * stat line.
   */
  stripsArmor = false;

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
    // Blades start evenly spaced, so three of them read as a ring rather than
    // as one blade that stutters. Placed on the ring at spawn rather than
    // waiting for the first tick — a ring that starts collapsed on the hero
    // and springs outward reads as a bug.
    const angle = spec.orbit ? (spec.orbit.index / spec.orbit.count) * Math.PI * 2 : 0;
    const zone: GroundZone = {
      id: this.ids.allocate(),
      x: spec.orbit ? x + Math.cos(angle) * spec.orbit.distance : x,
      y: spec.orbit ? y + Math.sin(angle) * spec.orbit.distance : y,
      orbit: spec.orbit,
      angle,
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

  /**
   * `anchorX/Y` is where orbiting zones circle — the hero. Static zones ignore
   * it entirely, so a caller with nothing to anchor can pass anything.
   */
  tick(dt: number, anchorX = 0, anchorY = 0): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i]!;
      if (z.orbit) {
        z.angle += z.orbit.revolutionsPerSecond * Math.PI * 2 * dt;
        z.x = anchorX + Math.cos(z.angle) * z.orbit.distance;
        z.y = anchorY + Math.sin(z.angle) * z.orbit.distance;
      }
      const rSq = z.radius * z.radius;

      const pulsing = (z.pulseIn -= dt) <= 0;
      if (pulsing) z.pulseIn += PULSE_INTERVAL;

      this.hits.length = 0;
      for (const e of this.enemies.enemies) {
        const dx = e.x - z.x;
        const dy = e.y - z.y;
        if (dx * dx + dy * dy > rSq) continue;
        if (z.slowMultiplier < 1) this.enemies.applySlow(e.id, z.slowMultiplier, SLOW_REFRESH);
        if (this.stripsArmor) this.enemies.stripArmor(e.id, SLOW_REFRESH);
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
