import type { TowerStats } from '../data/schemas';
import type { EnemySystem } from './enemySystem';
import type { IdGenerator } from './ids';
import type { LanePath, MutableVec2 } from './path';
import type { PlotState, TowerSystem } from './towerSystem';
import { noScaling, type Scaling } from './scaling';

/** How finely a lane is sampled when looking for the nearest point to a plot. */
const LANE_SAMPLE_STEP = 8;

/** A soldier steps this much faster than it is worth animating precisely. */
const SOLDIER_SPEED = 46;

/** What a soldier needs to fight, whatever raised it. */
export interface SoldierCombat {
  readonly damage: number;
  readonly attackInterval: number;
  readonly engageRadius: number;
}

export interface Soldier {
  readonly id: number;
  /** which garrison this soldier belongs to, or null for a mustered host */
  readonly plotId: string | null;
  /**
   * Combat stats for a soldier with no plot behind it. Garrison soldiers read
   * theirs from the plot every tick instead, so a perk that buffs a garrison
   * mid-run reaches soldiers already standing.
   */
  readonly transient: SoldierCombat | null;
  /** seconds left before a mustered host disperses; null = stands until it falls */
  expiresIn: number | null;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  /** the spot on the lane this soldier holds when nothing is engaging it */
  postX: number;
  postY: number;
  /** enemy currently held, or null */
  targetId: number | null;
  attackCooldown: number;
  /** > 0 = down, counting toward its replacement walking out */
  respawnIn: number;
  facingX: number;
  facingY: number;
}

/**
 * The third pillar (TRIANGLE.md §B.2): soldiers that **hold the road**.
 *
 * The whole design is in one sentence — a soldier blocks one enemy and barely
 * scratches it. Every second an enemy spends stopped is a second the towers
 * shoot it for free, so the army supplies *exposure*, which multiplies the
 * towers' *rate*. Towers and the hero both produce damage and are therefore
 * substitutes forever; this produces something neither of them can, which is
 * the only reason a third pillar exists at all.
 *
 * Two properties keep it from becoming a fourth tower:
 *
 * - **One soldier, one enemy.** Squad size is the exposure dial. A wave with
 *   more bodies than the line has soldiers simply walks past, which is what
 *   stops the army clearing a map alone.
 * - **Damage is a rounding error.** Soldiers are meant to lose eventually. A
 *   squad that kills things is a rate source, and we are back to substitutes.
 *
 * Content-agnostic (CLAUDE.md #1): this file knows what a `garrison` stat block
 * is and has never heard of a barracks. Any tower whose stats carry one posts
 * soldiers, including one that gains a garrison by upgrading into it.
 */
export class ArmySystem {
  /** Live board scaling. Defaults to a no-op so engine tests need not supply one. */
  scaling: Scaling = noScaling();

  private readonly towers: TowerSystem;
  private readonly enemies: EnemySystem;
  private readonly lanes: Map<string, LanePath>;
  private readonly ids: IdGenerator;
  private readonly list: Soldier[] = [];
  private readonly byId = new Map<number, Soldier>();
  /** plotId → its soldiers, so a sell or a downgrade can retire exactly those. */
  private readonly byPlot = new Map<string, Soldier[]>();
  /** Dispersed mid-tick; swept once the loop is done. See `tick`. */
  private readonly pendingRemoval: Soldier[] = [];
  private readonly scratch: MutableVec2 = { x: 0, y: 0 };

  readonly onSpawn: Array<(s: Soldier) => void> = [];
  readonly onDeath: Array<(s: Soldier) => void> = [];
  /** A soldier landed a blow — the renderer uses it for the clash. */
  readonly onAttack: Array<(s: Soldier, enemyId: number) => void> = [];

  constructor(
    towers: TowerSystem,
    enemies: EnemySystem,
    lanes: Map<string, LanePath>,
    ids: IdGenerator,
  ) {
    this.towers = towers;
    this.enemies = enemies;
    this.lanes = lanes;
    this.ids = ids;
  }

  /** Live and downed soldiers, unordered. Do not mutate. */
  get soldiers(): readonly Soldier[] {
    return this.list;
  }

  /** Soldiers currently standing — the number that matters for exposure. */
  get standingCount(): number {
    let n = 0;
    for (const s of this.list) if (s.respawnIn <= 0) n++;
    return n;
  }

  /**
   * Rule `soldiers-reform`: every fallen soldier returns at once.
   *
   * Called on a wave clear rather than continuously, so it never makes the
   * garrison unkillable mid-fight — it only means a wave that cost you the
   * whole host is not also a wave that starts the next one undefended.
   */
  reformAll(): void {
    for (const s of this.list) s.respawnIn = 0;
  }

  tick(dt: number): void {
    this.reconcile();

    // Iterated over a copy-free index but removed via a pending list: a
    // mustered soldier can leave mid-loop, and swap-removing under a for-of
    // silently skips whoever got swapped into the vacated slot.
    for (const s of this.list) {
      if (s.respawnIn > 0) {
        s.respawnIn -= dt;
        if (s.respawnIn <= 0) {
          s.respawnIn = 0;
          s.hp = s.maxHp;
          s.x = s.postX;
          s.y = s.postY;
          for (const fn of this.onSpawn) fn(s);
        }
        continue;
      }

      const garrison = s.plotId === null ? null : this.garrisonFor(s.plotId);
      const combat = garrison ?? s.transient;
      if (!combat) continue; // plot sold mid-tick; reconcile() retires it next tick

      // A mustered host is on a clock. Falling and expiring are the same
      // outcome for it — there is no replacement either way, which is what
      // keeps the Muster a burst rather than a second garrison.
      if (s.expiresIn !== null) {
        s.expiresIn -= dt;
        if (s.expiresIn <= 0) {
          this.disperse(s);
          continue;
        }
      }

      // Checked at the top rather than only after the enemy's blow, so any
      // future source of soldier damage — a stray blast, a wave event — puts a
      // soldier down properly instead of leaving a 0-hp body holding an enemy.
      if (s.hp <= 0) {
        if (garrison) this.fell(s, garrison.respawn);
        else this.disperse(s);
        continue;
      }

      const target = s.targetId === null ? null : this.enemies.getById(s.targetId);
      if (!target || target.blockedBy !== s.id) {
        // Target died, escaped, or was re-assigned. Let go and look again.
        s.targetId = null;
        this.seek(s, combat);
        this.walkToward(s, s.postX, s.postY, dt);
        continue;
      }

      // Close the last few units, then trade blows. Soldiers step to the enemy
      // rather than the enemy stepping back, so the fight happens on the road
      // where the towers can see it.
      const reach = target.config.radius + 10;
      const dx = target.x - s.x;
      const dy = target.y - s.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > reach) {
        this.walkToward(s, target.x, target.y, dt);
      } else {
        s.facingX = dx / dist;
        s.facingY = dy / dist;
      }

      s.attackCooldown -= dt;
      if (s.attackCooldown <= 0 && dist <= reach) {
        s.attackCooldown = combat.attackInterval;
        for (const fn of this.onAttack) fn(s, target.id);
        // Position is passed so a shieldbearer met head-on still shrugs it off:
        // a soldier standing in front of a shield is exactly the case the
        // frontal block is for, and exempting the army would quietly delete a
        // counter DESIGN §6 spent real effort establishing.
        this.enemies.applyDamage(target.id, combat.damage * this.scaling.soldierDamage(), s.x, s.y);
      }

      // The enemy fights back on its own account. `siegeDps` is reused rather
      // than adding a second damage number: a thing that batters gates hard
      // should cut through soldiers hard, and one tuned number cannot drift
      // out of step with itself.
      const incoming = target.config.siegeDps * (target.config.antiInfantry ?? 1) * dt;
      s.hp -= incoming;
      if (s.hp <= 0) {
        if (garrison) this.fell(s, garrison.respawn);
        else this.disperse(s);
      }
    }

    if (this.pendingRemoval.length > 0) {
      for (const s of this.pendingRemoval) this.remove(s);
      this.pendingRemoval.length = 0;
    }
  }

  /**
   * The Muster (TRIANGLE.md §B.2): a host marches out and holds the road until
   * it falls or its time runs out. No plot, no replacements.
   *
   * Posted on the lane nearest the cast point, exactly like a garrison, so the
   * hero's own contribution to exposure obeys the same geometry — riding to the
   * right stretch of road is the decision, and a host mustered in a field does
   * nothing at all.
   */
  muster(
    x: number,
    y: number,
    spec: {
      squad: number;
      hp: number;
      damage: number;
      attackInterval: number;
      lifetime: number;
      engageRadius: number;
      spacing: number;
    },
  ): void {
    const combat: SoldierCombat = {
      damage: spec.damage,
      attackInterval: spec.attackInterval,
      engageRadius: spec.engageRadius,
    };
    const posts = this.postsAround(x, y, spec.squad, spec.spacing, spec.engageRadius * 2);
    for (let i = 0; i < spec.squad; i++) {
      const post = posts[i]!;
      const s: Soldier = {
        id: this.ids.allocate(),
        plotId: null,
        transient: combat,
        expiresIn: spec.lifetime,
        hp: spec.hp,
        maxHp: spec.hp,
        x: post.x,
        y: post.y,
        postX: post.x,
        postY: post.y,
        targetId: null,
        attackCooldown: 0,
        respawnIn: 0,
        facingX: 0,
        facingY: -1,
      };
      this.list.push(s);
      this.byId.set(s.id, s);
      for (const fn of this.onSpawn) fn(s);
    }
  }

  /** A mustered soldier leaves the field entirely — there is nothing to respawn. */
  private disperse(s: Soldier): void {
    if (this.pendingRemoval.includes(s)) return;
    s.expiresIn = 0;
    s.hp = 0;
    this.release(s);
    this.pendingRemoval.push(s);
    for (const fn of this.onDeath) fn(s);
  }

  private remove(s: Soldier): void {
    this.byId.delete(s.id);
    const i = this.list.indexOf(s);
    if (i >= 0) {
      const last = this.list[this.list.length - 1]!;
      this.list[i] = last;
      this.list.pop();
    }
  }

  /**
   * A soldier grabs the nearest enemy it can reach from its post.
   *
   * Measured from the *post*, not from the soldier, so a line cannot be walked
   * off its position by a stream of targets — chase one enemy, and the road
   * behind you is open. That is the difference between a picket and a mob.
   */
  private seek(s: Soldier, combat: SoldierCombat): void {
    const rSq = combat.engageRadius * combat.engageRadius;
    let best: number | null = null;
    let bestSq = Infinity;
    for (const e of this.enemies.enemies) {
      if (e.state !== 'walking') continue; // already held, looting, or besieging
      if (e.blockedBy !== null) continue;
      // Airborne enemies are unreachable by ground troops, and `blockImmune`
      // rides through the line. Both are the same rule from the army's side:
      // the pillar has holes, on purpose.
      if (e.config.flying || e.config.blockImmune) continue;
      const dx = e.x - s.postX;
      const dy = e.y - s.postY;
      const dSq = dx * dx + dy * dy;
      if (dSq > rSq || dSq >= bestSq) continue;
      bestSq = dSq;
      best = e.id;
    }
    if (best === null) return;
    const enemy = this.enemies.getById(best)!;
    enemy.state = 'blocked';
    enemy.blockedBy = s.id;
    s.targetId = best;
  }

  private walkToward(s: Soldier, tx: number, ty: number, dt: number): void {
    const dx = tx - s.x;
    const dy = ty - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) return;
    s.facingX = dx / dist;
    s.facingY = dy / dist;
    const step = Math.min(dist, SOLDIER_SPEED * dt);
    s.x += s.facingX * step;
    s.y += s.facingY * step;
  }

  private fell(s: Soldier, respawn: number): void {
    s.hp = 0;
    s.respawnIn = respawn;
    this.release(s);
    for (const fn of this.onDeath) fn(s);
  }

  /** Hand back whatever this soldier was holding. The enemy resumes its walk. */
  private release(s: Soldier): void {
    if (s.targetId === null) return;
    const enemy = this.enemies.getById(s.targetId);
    if (enemy && enemy.blockedBy === s.id) {
      enemy.blockedBy = null;
      // Only back to walking if it is still on the road — a blocked enemy that
      // somehow reached a siege slot must not be sent back out.
      if (enemy.state === 'blocked') enemy.state = 'walking';
    }
    s.targetId = null;
  }

  /**
   * Match the roster to the plots: raise squads for new garrisons, retire the
   * soldiers of a plot that was sold or downgraded out of one, and resize when
   * an upgrade changes the squad.
   *
   * Run every tick rather than hooked to build/sell/upgrade/downgrade because
   * there are four ways a plot's stats can change and a missed hook is a squad
   * that fights for a tower that is no longer there.
   */
  private reconcile(): void {
    for (const plot of this.towers.plots) {
      const garrison = this.towers.stats(plot)?.garrison ?? null;
      const existing = this.byPlot.get(plot.plotId);

      if (!garrison) {
        if (existing) this.retire(plot.plotId);
        continue;
      }

      if (!existing) {
        this.raise(plot, garrison);
        continue;
      }
      if (existing.length !== garrison.squad) {
        // Squad size changed with a level. Simplest correct answer is to re-post
        // the whole line: posts are spaced relative to the squad size, so
        // keeping the old soldiers would leave them standing in the wrong place.
        this.retire(plot.plotId);
        this.raise(plot, garrison);
      }
    }
  }

  private raise(plot: PlotState, garrison: NonNullable<TowerStats['garrison']>): void {
    const squad: Soldier[] = [];
    const posts = this.postsFor(plot, garrison);
    for (let i = 0; i < garrison.squad; i++) {
      const post = posts[i]!;
      const s: Soldier = {
        id: this.ids.allocate(),
        plotId: plot.plotId,
        transient: null,
        expiresIn: null,
        hp: garrison.hp,
        maxHp: garrison.hp,
        x: post.x,
        y: post.y,
        postX: post.x,
        postY: post.y,
        targetId: null,
        attackCooldown: 0,
        respawnIn: 0,
        facingX: 0,
        facingY: -1,
      };
      squad.push(s);
      this.list.push(s);
      this.byId.set(s.id, s);
      for (const fn of this.onSpawn) fn(s);
    }
    this.byPlot.set(plot.plotId, squad);
  }

  private retire(plotId: string): void {
    const squad = this.byPlot.get(plotId);
    if (!squad) return;
    for (const s of squad) {
      this.release(s);
      this.remove(s);
      for (const fn of this.onDeath) fn(s);
    }
    this.byPlot.delete(plotId);
  }

  /**
   * Where a squad stands: on the nearest lane if one is within `rallyRange`,
   * spread along it so they form a line across the road rather than a stack.
   *
   * A plot with no lane in range keeps its soldiers at home. They will block
   * nothing, which is the honest outcome — the alternative is teleporting a
   * garrison across the map to find work, and a plot's position is supposed to
   * be the decision.
   */
  private postsFor(
    plot: PlotState,
    garrison: NonNullable<TowerStats['garrison']>,
  ): Array<{ x: number; y: number }> {
    return this.postsAround(plot.x, plot.y, garrison.squad, garrison.spacing, garrison.rallyRange);
  }

  /** Shared by garrisons and the Muster — both post a line on the nearest road. */
  private postsAround(
    x: number,
    y: number,
    squad: number,
    spacing: number,
    rallyRange: number,
  ): Array<{ x: number; y: number }> {
    const found = this.nearestLanePoint(x, y, rallyRange);
    const out: Array<{ x: number; y: number }> = [];
    const mid = (squad - 1) / 2;
    for (let i = 0; i < squad; i++) {
      if (!found) {
        // Fan out around the origin so they are at least not co-located.
        const a = (i / squad) * Math.PI * 2;
        out.push({ x: x + Math.cos(a) * spacing, y: y + Math.sin(a) * spacing });
        continue;
      }
      const offset = (i - mid) * spacing;
      const d = found.lane.directionAt(found.distance, this.scratch);
      // Perpendicular to travel — the line stands across the road, not down it.
      out.push({ x: found.x - d.y * offset, y: found.y + d.x * offset });
    }
    return out;
  }

  private nearestLanePoint(
    x: number,
    y: number,
    maxDistance: number,
  ): { lane: LanePath; distance: number; x: number; y: number } | null {
    let best: { lane: LanePath; distance: number; x: number; y: number } | null = null;
    let bestSq = maxDistance * maxDistance;
    for (const lane of this.lanes.values()) {
      for (let d = 0; d <= lane.totalLength; d += LANE_SAMPLE_STEP) {
        lane.positionAt(d, this.scratch);
        const dx = this.scratch.x - x;
        const dy = this.scratch.y - y;
        const dSq = dx * dx + dy * dy;
        if (dSq >= bestSq) continue;
        bestSq = dSq;
        best = { lane, distance: d, x: this.scratch.x, y: this.scratch.y };
      }
    }
    return best;
  }

  private garrisonFor(plotId: string): NonNullable<TowerStats['garrison']> | null {
    const plot = this.towers.getPlot(plotId);
    if (!plot) return null;
    return this.towers.stats(plot)?.garrison ?? null;
  }
}
