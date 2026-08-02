import type { Perk, PerksFile } from '../data/schemas';
import { applyEffectInPlace, type ModifiableData } from './metaModifiers';

/**
 * The in-run draft: pick 1 of N on every wave clear (DESIGN §15.1).
 *
 * **Why this can mutate live balance data.** Every system that consumes a
 * config holds it *by reference* and reads it each tick — `HeroSystem` keeps
 * `config: Hero` and reads `config.moveSpeed` inside its move loop,
 * `TowerSystem` stores the very `Tower` objects from the file in `towersById`,
 * `EconomySystem` keeps `config` and reads it live. The Simulation is already
 * built on a private clone made by `applyMetaModifiers`, so writing to that
 * clone mid-run changes the game immediately and affects nothing else. No
 * snapshotting, no rebuild, no restart.
 *
 * The one exception is the gate: `GateSystem` copies `hp` into `maxHp` at
 * construction, so a gate perk has to be routed through a method instead of a
 * field. That is what `onGateMaxHpChanged` exists for — see `take`.
 *
 * Content-agnostic by construction (CLAUDE.md #1): this file knows about
 * weights, stacks and offers. It has never heard of a bow or a bombard.
 */
export class PerkSystem {
  private readonly pool: readonly Perk[];
  private readonly byId: ReadonlyMap<string, Perk>;
  private readonly offerSize: number;
  private readonly data: ModifiableData;
  private readonly rng: () => number;

  /** perk id → stacks taken this run. */
  private readonly taken = new Map<string, number>();

  /**
   * The cards currently on the table, or null when there is no pending draft.
   * The renderer shows this; the sim does not block on it, so a player who
   * ignores the draft simply keeps their choice in hand.
   */
  offer: readonly Perk[] | null = null;

  /** Fired when a gate-capacity perk lands, because GateSystem owns that number. */
  readonly onGateMaxHpChanged: Array<(delta: number) => void> = [];
  /** Fired on every pick — the renderer uses it for feedback, the harness for logging. */
  readonly onTaken: Array<(perk: Perk, stacks: number) => void> = [];

  constructor(file: PerksFile, data: ModifiableData, rng: () => number = Math.random) {
    this.pool = file.perks;
    this.byId = new Map(file.perks.map((p) => [p.id, p]));
    this.offerSize = file.offerSize;
    this.data = data;
    this.rng = rng;
  }

  /** Stacks taken of a given perk. */
  stacksOf(perkId: string): number {
    return this.taken.get(perkId) ?? 0;
  }

  /** Everything taken this run, for the HUD and the run summary. */
  get takenPerks(): Array<{ perk: Perk; stacks: number }> {
    const out: Array<{ perk: Perk; stacks: number }> = [];
    for (const [id, stacks] of this.taken) {
      const perk = this.byId.get(id);
      if (perk) out.push({ perk, stacks });
    }
    return out;
  }

  private eligible(): Perk[] {
    return this.pool.filter((p) => this.stacksOf(p.id) < p.maxStacks);
  }

  /**
   * Deal a new offer. Weighted sampling *without replacement*, so a draft never
   * shows the same card twice — the whole point of a pick-1-of-3 is three real
   * options.
   *
   * Draws from the injected rng, which means a seeded run replays its drafts
   * exactly. That is what lets `npm run bots` measure perk balance instead of
   * only measuring the waves.
   */
  deal(): readonly Perk[] | null {
    const candidates = this.eligible();
    if (candidates.length === 0) {
      this.offer = null;
      return null;
    }

    const picked: Perk[] = [];
    const remaining = [...candidates];
    const size = Math.min(this.offerSize, remaining.length);
    for (let i = 0; i < size; i++) {
      let total = 0;
      for (const p of remaining) total += p.weight;
      let roll = this.rng() * total;
      let index = remaining.length - 1;
      for (let j = 0; j < remaining.length; j++) {
        roll -= remaining[j]!.weight;
        if (roll <= 0) {
          index = j;
          break;
        }
      }
      picked.push(remaining[index]!);
      remaining.splice(index, 1);
    }

    this.offer = picked;
    return this.offer;
  }

  /**
   * Take a perk. Only ever one rank at a time, which is exactly equivalent to
   * applying N ranks at once — see `applyEffectInPlace`.
   *
   * Rejects anything not currently on offer: the draft is the only way perks
   * enter a run, and letting an arbitrary id through would make the offer
   * cosmetic.
   */
  take(perkId: string): boolean {
    if (!this.offer?.some((p) => p.id === perkId)) return false;
    const perk = this.byId.get(perkId);
    if (!perk) return false;

    const stacks = this.stacksOf(perkId);
    if (stacks >= perk.maxStacks) return false;

    const fx = perk.effect;
    // The gate is the one stat a system copies instead of reading, so it is
    // routed rather than written. Measured as a delta so 'add' and 'multiply'
    // both work without this file knowing which was used.
    if (fx.type === 'kingdom-stat' && fx.stat === 'gateMaxHp') {
      const before = this.data.map.gate.hp;
      applyEffectInPlace(this.data, fx, 1);
      const delta = this.data.map.gate.hp - before;
      for (const fn of this.onGateMaxHpChanged) fn(delta);
    } else {
      applyEffectInPlace(this.data, fx, 1);
    }

    this.taken.set(perkId, stacks + 1);
    this.offer = null;
    for (const fn of this.onTaken) fn(perk, stacks + 1);
    return true;
  }

  /** Decline the draft. The card is spent; the run moves on. */
  skip(): void {
    this.offer = null;
  }
}
