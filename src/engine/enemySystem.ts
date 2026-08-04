import type { EliteConfig, Enemy } from '../data/schemas';
import type { IdGenerator } from './ids';
import type { LanePath } from './path';

/**
 * 'walking' — advancing along its lane
 * 'blocked' — stopped on the road, fighting a soldier. Resumes walking the
 *             moment the soldier dies; the ArmySystem owns both transitions.
 * 'to-slot' — reached the path end, marching to its assigned siege position
 * 'at-slot' — in position at the gate. Leaks never despawn (DESIGN §6);
 *             whether this spot deals siege damage is the GateSystem's call
 *             (attack slot) or not (overflow queue).
 */
export type EnemyState = 'walking' | 'blocked' | 'to-slot' | 'at-slot' | 'looting' | 'hunting';

export interface EnemyInstance {
  readonly id: number;
  readonly config: Enemy;
  readonly laneId: string;
  readonly maxHp: number;
  readonly isElite: boolean;
  hp: number;
  distance: number;
  state: EnemyState;
  /** world position, refreshed every tick from the lane path (no per-tick allocation) */
  x: number;
  y: number;
  /** siege position assigned by the GateSystem while to-slot / at-slot */
  slotX: number;
  slotY: number;
  /** normalized travel direction — the shieldbearer's shield faces this way */
  facingX: number;
  facingY: number;
  /** movement debuff: 1 = none, 0 = frozen. Applied while slowRemaining > 0. */
  slowFactor: number;
  slowRemaining: number;
  /**
   * Seconds of "no armour" left, from rule `zones-strip-armor`.
   *
   * A countdown rather than a boolean because the zone that applied it moves
   * and expires — a flag set on entry would need a matching clear on exit, and
   * an enemy that walks out of a patch during the frame it dies would keep the
   * effect forever. Refreshed while standing in the patch, exactly like slow.
   */
  armorStrippedFor: number;
  /** damage taken multiplier while slowed (Brittle marks) */
  vulnerability: number;
  /** movement buff from war cries; active while hasteRemaining > 0 */
  hasteFactor: number;
  hasteRemaining: number;
  /** seconds until this enemy's next war cry (warCry configs only) */
  cryCooldown: number;
  /** damage-taken multiplier from a Warden's standard; active while wardRemaining > 0 */
  wardFactor: number;
  wardRemaining: number;
  /** seconds until this enemy's next ward pulse (ward configs only) */
  wardCooldown: number;
  /** soldier id holding this enemy while state is 'blocked'; the ArmySystem owns it */
  blockedBy: number | null;
}

/**
 * Owns all live enemies. Generic over the roster — configs come in as
 * validated schema data; nothing here knows any enemy by name.
 */
export class EnemySystem {
  private readonly configs: Map<string, Enemy>;
  private readonly lanes: Map<string, LanePath>;
  private readonly ids: IdGenerator;
  private readonly elite: EliteConfig | null;
  private readonly rng: () => number;
  private readonly list: EnemyInstance[] = [];
  private readonly byId = new Map<number, EnemyInstance>();
  private readonly scratchDir = { x: 0, y: 1 };

  /** Listener arrays — the sim and the renderer both subscribe. */
  readonly onSpawn: Array<(e: EnemyInstance) => void> = [];
  readonly onDeath: Array<(e: EnemyInstance) => void> = [];
  readonly onReachEnd: Array<(e: EnemyInstance) => void> = [];
  readonly onDamaged: Array<(e: EnemyInstance, amount: number) => void> = [];
  readonly onEscape: Array<(e: EnemyInstance) => void> = [];
  readonly onWarCry: Array<(e: EnemyInstance, radius: number) => void> = [];

  constructor(
    configs: readonly Enemy[],
    lanes: Map<string, LanePath>,
    ids: IdGenerator,
    elite: EliteConfig | null = null,
    rng: () => number = Math.random,
  ) {
    this.configs = new Map(configs.map((c) => [c.id, c]));
    this.lanes = lanes;
    this.ids = ids;
    this.elite = elite;
    this.rng = rng;
  }

  spawn(enemyId: string, laneId: string, hpMultiplier: number): EnemyInstance {
    const config = this.configs.get(enemyId);
    if (!config) throw new Error(`EnemySystem: unknown enemy config "${enemyId}"`);
    const lane = this.lanes.get(laneId);
    if (!lane) throw new Error(`EnemySystem: unknown lane "${laneId}"`);

    const isElite =
      this.elite !== null && config.eliteEligible && this.rng() < this.elite.chance;
    const eliteMult = isElite ? this.elite!.hpMultiplier : 1;
    const maxHp = Math.round(config.hp * hpMultiplier * eliteMult);
    const e: EnemyInstance = {
      id: this.ids.allocate(),
      config,
      laneId,
      maxHp,
      isElite,
      hp: maxHp,
      distance: 0,
      state: 'walking',
      x: 0,
      y: 0,
      slotX: 0,
      slotY: 0,
      facingX: 0,
      facingY: 1,
      slowFactor: 1,
      slowRemaining: 0,
      armorStrippedFor: 0,
      vulnerability: 1,
      hasteFactor: 1,
      hasteRemaining: 0,
      wardFactor: 1,
      wardRemaining: 0,
      cryCooldown: config.warCry ? config.warCry.interval * 0.4 : 0,
      wardCooldown: config.ward ? config.ward.interval * 0.4 : 0,
      blockedBy: null,
    };
    lane.positionAt(0, e);
    const dir = lane.directionAt(0, this.scratchDir);
    e.facingX = dir.x;
    e.facingY = dir.y;
    this.list.push(e);
    this.byId.set(e.id, e);
    for (const fn of this.onSpawn) fn(e);
    return e;
  }

  tick(dt: number): void {
    for (const e of this.list) {
      if (e.armorStrippedFor > 0) {
        e.armorStrippedFor -= dt;
        if (e.armorStrippedFor < 0) e.armorStrippedFor = 0;
      }
      if (e.slowRemaining > 0) {
        e.slowRemaining -= dt;
        if (e.slowRemaining <= 0) {
          e.slowRemaining = 0;
          e.slowFactor = 1;
          e.vulnerability = 1;
        }
      }
      if (e.hasteRemaining > 0) {
        e.hasteRemaining -= dt;
        if (e.hasteRemaining <= 0) {
          e.hasteRemaining = 0;
          e.hasteFactor = 1;
        }
      }
      const cry = e.config.warCry;
      if (cry) {
        e.cryCooldown -= dt;
        if (e.cryCooldown <= 0) {
          e.cryCooldown = cry.interval;
          const rSq = cry.radius * cry.radius;
          for (const other of this.list) {
            if (other === e) continue;
            const dx = other.x - e.x;
            const dy = other.y - e.y;
            if (dx * dx + dy * dy > rSq) continue;
            other.hasteFactor = Math.max(other.hasteFactor, cry.speedMultiplier);
            other.hasteRemaining = Math.max(other.hasteRemaining, cry.duration);
          }
          for (const fn of this.onWarCry) fn(e, cry.radius);
        }
      }
      if (e.wardRemaining > 0) {
        e.wardRemaining -= dt;
        if (e.wardRemaining <= 0) {
          e.wardRemaining = 0;
          e.wardFactor = 1;
        }
      }
      // The defensive twin of warCry: everything near the standard is harder
      // to kill — except the bearer itself, or the counter (focus the Warden)
      // would be recursive.
      const ward = e.config.ward;
      if (ward) {
        e.wardCooldown -= dt;
        if (e.wardCooldown <= 0) {
          e.wardCooldown = ward.interval;
          const rSq = ward.radius * ward.radius;
          for (const other of this.list) {
            if (other === e) continue;
            const dx = other.x - e.x;
            const dy = other.y - e.y;
            if (dx * dx + dy * dy > rSq) continue;
            other.wardFactor = Math.min(other.wardFactor, ward.factor);
            other.wardRemaining = Math.max(other.wardRemaining, ward.duration);
          }
        }
      }

      const speed = this.effectiveSpeed(e);

      if (e.state === 'looting') continue; // the LooterSystem drives these
      if (e.state === 'hunting') continue; // the StalkerSystem drives these
      // Held on the road. It keeps its lane distance, so releasing it resumes
      // the walk from exactly where it stopped rather than teleporting it.
      if (e.state === 'blocked') continue; // the ArmySystem drives these

      if (e.state === 'walking') {
        const lane = this.lanes.get(e.laneId)!;
        e.distance += speed * dt;
        if (e.distance >= lane.totalLength) {
          e.distance = lane.totalLength;
          lane.positionAt(e.distance, e);
          e.state = 'to-slot';
          e.slotX = e.x; // placeholder until a GateSystem listener assigns a real slot
          e.slotY = e.y;
          for (const fn of this.onReachEnd) fn(e);
        } else {
          lane.positionAt(e.distance, e);
          const dir = lane.directionAt(e.distance, this.scratchDir);
          e.facingX = dir.x;
          e.facingY = dir.y;
        }
      } else if (e.state === 'to-slot') {
        const dx = e.slotX - e.x;
        const dy = e.slotY - e.y;
        const dist = Math.hypot(dx, dy);
        const step = speed * dt;
        if (dist <= Math.max(step, 2)) {
          e.x = e.slotX;
          e.y = e.slotY;
          e.state = 'at-slot';
        } else {
          e.facingX = dx / dist;
          e.facingY = dy / dist;
          e.x += e.facingX * step;
          e.y += e.facingY * step;
        }
      }
      // 'at-slot': stands its ground; the GateSystem decides if it deals siege damage
    }
  }

  /**
   * Returns true if the hit was lethal. Pass the damage source position so
   * frontal-block enemies (Shieldbearer) can reduce damage from ahead —
   * omitting it means the hit ignores facing (auras, blasts).
   */
  applyDamage(
    id: number,
    amount: number,
    sourceX?: number,
    sourceY?: number,
    ignoresArmor = false,
  ): boolean {
    const e = this.byId.get(id);
    if (!e) return false;

    let dealt = amount;
    // Armor before the facing block, so the two stack multiplicatively rather
    // than one masking the other: an armored shieldbearer hit from the front
    // should be brutally hard, which is the point of having both counters.
    if (!ignoresArmor && e.armorStrippedFor <= 0 && e.config.armor > 0) {
      dealt *= 1 - e.config.armor;
    }
    // Momentum armour: shrugs off everything until something stops it. Checked
    // against the same `hindered` condition `damageVsHindered` and the
    // `crit-vs-hindered` rule use, so the three cannot drift apart about what
    // "held" means. Armour-stripping does *not* bypass it — the hide is not the
    // point, the speed is.
    const mom = e.config.momentumArmor;
    if (mom && e.slowRemaining <= 0 && e.state !== 'blocked') dealt *= mom.multiplier;
    const block = e.config.frontalBlock;
    if (block && sourceX !== undefined && sourceY !== undefined) {
      const dx = sourceX - e.x;
      const dy = sourceY - e.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        const cos = (dx * e.facingX + dy * e.facingY) / d;
        const halfArc = (block.arcDegrees / 2) * (Math.PI / 180);
        if (cos >= Math.cos(halfArc)) dealt *= block.multiplier;
      }
    }
    if (e.slowRemaining > 0 && e.vulnerability > 1) dealt *= e.vulnerability;
    if (e.wardRemaining > 0) dealt *= e.wardFactor; // the Warden's standard

    e.hp -= dealt;
    for (const fn of this.onDamaged) fn(e, dealt);
    if (e.hp > 0) return false;
    e.hp = 0;
    this.remove(e);
    for (const fn of this.onDeath) fn(e);
    return true;
  }

  effectiveSpeed(e: EnemyInstance): number {
    let speed = e.config.speed;
    if (e.slowRemaining > 0) speed *= e.slowFactor;
    if (e.hasteRemaining > 0) speed *= e.hasteFactor;
    return speed;
  }

  /** Removal without a death: an escapee takes its winnings and leaves. */
  despawn(id: number): void {
    const e = this.byId.get(id);
    if (!e) return;
    this.remove(e);
    for (const fn of this.onEscape) fn(e);
  }

  /** Slow (or freeze at factor 0). Stronger slows win; durations refresh. Slow-immune enemies shrug. */
  /** Rule `zones-strip-armor`. Refreshed, never accumulated — see the field. */
  stripArmor(id: number, duration: number): void {
    const e = this.byId.get(id);
    if (e) e.armorStrippedFor = Math.max(e.armorStrippedFor, duration);
  }

  /**
   * The playable field, for the spawn-approach guard below. Unset (Infinity)
   * means no guard — engine tests that build no map keep working unchanged.
   */
  private worldW = Infinity;
  private worldH = Infinity;
  setWorldBounds(width: number, height: number): void {
    this.worldW = width;
    this.worldH = height;
  }

  applySlow(id: number, factor: number, duration: number, vulnerability = 1): void {
    const e = this.byId.get(id);
    if (!e) return;
    if (e.config.ignoresSlows) return;
    // The spawn-approach guard. An enemy still on the off-screen approach can
    // be *hit* but not *held*: a slow that lands out there can freeze a flyer
    // where ground-only towers cannot see it and the hero's margin clamp
    // cannot reach it, and the wave never ends (found at 12/12 stalls by two
    // experimental plots near a west-approach — BIOMES.md Part M). Guarded
    // here, at the single choke point every slow source funnels through:
    // auras, stuns, zones, and whatever comes next.
    if (e.x < 0 || e.y < 0 || e.x > this.worldW || e.y > this.worldH) return;
    if (e.slowRemaining <= 0 || factor <= e.slowFactor) e.slowFactor = factor;
    e.slowRemaining = Math.max(e.slowRemaining, duration);
    if (vulnerability > e.vulnerability) e.vulnerability = vulnerability;
  }

  private remove(e: EnemyInstance): void {
    const i = this.list.indexOf(e);
    if (i >= 0) {
      const last = this.list[this.list.length - 1]!;
      this.list[i] = last;
      this.list.pop();
    }
    this.byId.delete(e.id);
  }

  getById(id: number): EnemyInstance | undefined {
    return this.byId.get(id);
  }

  /** Live enemies, unordered (swap-remove). Do not mutate. */
  get enemies(): readonly EnemyInstance[] {
    return this.list;
  }

  get aliveCount(): number {
    return this.list.length;
  }

  /**
   * Enemies still coming down the road — the sim's "is this wave over" test.
   *
   * 'blocked' counts. A held enemy has not arrived and has not died; it is
   * standing on the road being shot at. Leaving it out would end the wave early
   * and hand the player a clear while the army was still doing its job.
   */
  get walkingCount(): number {
    let n = 0;
    for (const e of this.list) if (e.state === 'walking' || e.state === 'blocked' || e.state === 'hunting') n++;
    return n;
  }
}
