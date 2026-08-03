import type { Economy } from '../data/schemas';

/**
 * Kills → XP → levels → drafts (TRIANGLE.md §B.4).
 *
 * This replaces `everyNWaves` as the draft's cadence, and the replacement is
 * the point rather than an implementation detail. A card per wave clear ties
 * progression to *surviving*; a card per level ties it to *fighting*, and
 * fighting means riding out to where the enemies are. DESIGN §1's first pillar
 * — greed pulls you toward danger — has been sitting beside the reward loop
 * since M0 instead of driving it.
 *
 * Content-agnostic (CLAUDE.md #1): it is handed a number and a curve. It has
 * never heard of a grunt.
 */
export class XpSystem {
  private readonly config: Economy['xp'];
  private total = 0;
  private levelValue = 1;
  /** XP banked toward the next level, i.e. total minus every threshold crossed. */
  private intoLevel = 0;

  /**
   * Fired once per level gained, with the new level. Plural on purpose: a
   * single elite kill can cross two thresholds late in a run, and a listener
   * that assumed one-at-a-time would silently swallow a draft.
   */
  readonly onLevelUp: Array<(level: number) => void> = [];

  constructor(config: Economy['xp']) {
    this.config = config;
  }

  get level(): number {
    return this.levelValue;
  }

  get totalXp(): number {
    return this.total;
  }

  /** XP earned toward the next level. */
  get progress(): number {
    return this.intoLevel;
  }

  /** XP needed to leave the current level — the denominator for the HUD bar. */
  get toNextLevel(): number {
    return this.thresholdFor(this.levelValue + 1);
  }

  /** 0–1 through the current level. */
  get fraction(): number {
    const need = this.toNextLevel;
    return need > 0 ? Math.min(1, this.intoLevel / need) : 0;
  }

  /** Cost of reaching `level` from the one below it. */
  private thresholdFor(level: number): number {
    return this.config.base * Math.pow(this.config.growth, Math.max(0, level - 2));
  }

  /**
   * Award XP for a kill. `value` is the enemy's own `xpValue` when it has one;
   * pass undefined to take the roster default.
   */
  award(value: number | undefined, isElite: boolean): void {
    const base = value ?? this.config.perKillDefault;
    this.gain(base * (isElite ? this.config.eliteMultiplier : 1));
  }

  /** Raw XP, for sources that are not kills. */
  gain(amount: number): void {
    if (amount <= 0) return;
    this.total += amount;
    this.intoLevel += amount;
    // A loop, not an if: one big kill late in a run can cross two thresholds,
    // and each one owes the player a card.
    while (this.intoLevel >= this.toNextLevel) {
      this.intoLevel -= this.toNextLevel;
      this.levelValue++;
      for (const fn of this.onLevelUp) fn(this.levelValue);
    }
  }
}
