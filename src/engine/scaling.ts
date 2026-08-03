/**
 * Live power that grows with what else you built (`ScaleKeySchema`).
 *
 * Every other effect a node can carry is settled before wave 1: a stat is
 * folded into the balance data, a rule flips a switch. Scaling cannot be,
 * because the thing it counts — soldiers standing, gold banked, coins on the
 * ground — is different on every tick. So it lives here, behind one method per
 * relationship, and the systems that need a factor ask for it at the moment
 * they use it.
 *
 * **Why this exists at all.** Stats and rules are unconditional: "+20% bow
 * damage" is right in every build that ever existed. That is exactly why the
 * paths supplying damage directly measured at 100% and the paths supplying gold
 * and exposure measured at 13% — a complement can never win a contest scored on
 * damage. Scaling is the mechanism that pays a path for *being* a complement.
 *
 * Content-agnostic (CLAUDE.md #1): it counts soldiers, towers, coins and gold.
 * It has never heard of a barracks.
 */

/** Per-key configuration, summed across every node that granted it. */
export interface ScaleSpec {
  /** Fraction added per unit counted — 0.04 is "+4% each". */
  perUnit: number;
  /** Ceiling on the multiplier, so a runaway board cannot reach infinity. */
  max: number;
}

/** What the sim can count. Supplied by `Simulation`, which owns all of it. */
export interface ScaleSources {
  /** Soldiers currently standing (not waiting to respawn). */
  soldiersStanding(): number;
  /** Gold in hand right now. */
  gold(): number;
  /** Towers whose range covers a point. */
  towersCovering(x: number, y: number): number;
  /** Coins lying on the ground. */
  looseCoins(): number;
}

export class Scaling {
  private readonly specs: Readonly<Record<string, ScaleSpec>>;
  private readonly src: ScaleSources;

  constructor(specs: Record<string, ScaleSpec>, sources: ScaleSources) {
    this.specs = specs;
    this.src = sources;
  }

  /** True when no node granted any scaling — lets hot paths skip the work. */
  get isEmpty(): boolean {
    return Object.keys(this.specs).length === 0;
  }

  /**
   * `1 + perUnit × count`, clamped to the spec's ceiling.
   *
   * Returns exactly 1 for a key nothing granted, so every call site can
   * multiply unconditionally and no system needs to know which nodes a player
   * happens to hold.
   */
  private factor(key: string, count: number): number {
    const spec = this.specs[key];
    if (!spec || count <= 0) return 1;
    return Math.min(spec.max, 1 + spec.perUnit * count);
  }

  /** Towers hit harder for every soldier standing. Wall wants Host. */
  towerDamage(): number {
    return (
      this.factor('tower-damage-per-soldier', this.src.soldiersStanding()) *
      // Per *hundred* gold, floored: a build that scales off banked gold should
      // reward the decision to sit on it, not tick up on every coin collected.
      this.factor('tower-damage-per-100-gold', Math.floor(this.src.gold() / 100))
    );
  }

  /** The bow hits harder for every tower covering its target. Hunt wants Wall. */
  bowDamage(targetX: number, targetY: number): number {
    return (
      this.factor('bow-damage-per-covering-tower', this.src.towersCovering(targetX, targetY)) *
      this.factor('bow-damage-per-loose-coin', this.src.looseCoins())
    );
  }

  /** Ground zones hit harder the more they catch. Storm wants crowds. */
  zoneDamage(enemiesInside: number): number {
    return this.factor('zone-damage-per-enemy-inside', enemiesInside);
  }

  /** Soldiers hit harder in numbers. Host wants Host — the one self-referential key. */
  soldierDamage(): number {
    return this.factor('soldier-damage-per-soldier', this.src.soldiersStanding());
  }
}

/** A Scaling that does nothing, for engine tests and any run with no build. */
export function noScaling(): Scaling {
  return new Scaling(
    {},
    {
      soldiersStanding: () => 0,
      gold: () => 0,
      towersCovering: () => 0,
      looseCoins: () => 0,
    },
  );
}
