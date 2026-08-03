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
   * Cards owed but not yet on the table.
   *
   * Levels arrive faster than a player can answer them once XP drives the draft
   * (TRIANGLE.md §B.4) — a big elite kill can grant two at once, and a level
   * mid-charge goes unanswered for a while. Without a queue the second card
   * would either replace the first under the player's thumb or vanish. Both
   * read as the game eating a reward.
   */
  private queued = 0;

  /**
   * The cards currently on the table, or null when there is no pending draft.
   * The renderer shows this; the sim does not block on it, so a player who
   * ignores the draft simply keeps their choice in hand.
   */
  offer: readonly Perk[] | null = null;

  /** Fired when a gate-capacity perk lands, because GateSystem owns that number. */
  readonly onGateMaxHpChanged: Array<(delta: number) => void> = [];
  /**
   * Fired when a perk grants an ability. `applyEffectInPlace` cannot do this
   * itself — an unlock is a decision for a system, not a number to mutate — so
   * the return value has to be routed, and was being dropped on the floor
   * before abilities became draftable.
   */
  readonly onUnlockAbility: Array<(abilityId: string) => void> = [];
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

  /** Cards owed beyond the one currently on the table — the HUD shows this. */
  get queuedDrafts(): number {
    return this.queued;
  }

  /**
   * Owe the player a card. Deals immediately when the table is clear, otherwise
   * banks it for whenever the current offer is answered.
   */
  queue(): void {
    this.queued++;
    if (!this.offer) this.dealFromQueue();
  }

  private dealFromQueue(): void {
    if (this.queued <= 0) return;
    if (this.deal()) this.queued--;
    else this.queued = 0; // pool is dry; owing cards nobody can be dealt is a leak
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

  /**
   * Veto a card that would do nothing if taken. Set by the owner of whatever
   * the card would act on — the Simulation vetoes an ability unlock once the
   * bar is full, because the equip cap is enforced in AbilitySystem and this
   * file must not learn about it.
   *
   * Content-agnostic: a predicate, not a rule. PerkSystem still knows only
   * weights, stacks and offers.
   */
  isOfferable: ((perk: Perk) => boolean) | null = null;

  private eligible(): Perk[] {
    return this.pool.filter(
      (p) => this.stacksOf(p.id) < p.maxStacks && (this.isOfferable?.(p) ?? true),
    );
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

    // The offer rule (TRIANGLE.md §B.5): one hero card, one tower-or-army card,
    // then wildcards. This replaces per-perk balance tuning with a structural
    // guarantee — it bans nothing and removes no agency, you still choose
    // freely, but you cannot accidentally draft a pure-hero run however the
    // weights fall, and you never face three cards that are all dead for what
    // you built.
    //
    // Slots degrade to wildcard rather than shrinking the offer: late in a run
    // a whole family can be exhausted, and a two-card draft would read as the
    // game running out rather than as a rule being honoured.
    const SLOTS: ReadonlyArray<ReadonlyArray<Perk['family']> | null> = [
      ['hero'],
      ['towers', 'army'],
    ];
    for (let i = 0; i < size; i++) {
      const want = SLOTS[i] ?? null;
      const pool = want ? remaining.filter((p) => want.includes(p.family)) : remaining;
      const from = pool.length > 0 ? pool : remaining;
      const chosen = this.weightedPick(from);
      picked.push(chosen);
      remaining.splice(remaining.indexOf(chosen), 1);
    }

    this.offer = picked;
    return this.offer;
  }

  /** Weighted pick from a list. Drawn from the injected rng, so seeds replay. */
  private weightedPick(from: readonly Perk[]): Perk {
    let total = 0;
    for (const p of from) total += p.weight;
    let roll = this.rng() * total;
    for (const p of from) {
      roll -= p.weight;
      if (roll <= 0) return p;
    }
    return from[from.length - 1]!;
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

    // The gate is the one stat a system copies instead of reading, so it is
    // routed rather than written. Measured as a delta across the whole perk so
    // 'add' and 'multiply' both work — and so a perk that trades gate capacity
    // away reports a negative delta without this file knowing which effect did
    // it. Summed once, after every effect lands, because a single perk may
    // touch the gate more than once.
    const gateBefore = this.data.map.gate.hp;
    for (const fx of perk.effects) {
      const { unlockAbilityId } = applyEffectInPlace(this.data, fx, 1);
      if (unlockAbilityId) for (const fn of this.onUnlockAbility) fn(unlockAbilityId);
    }
    const gateDelta = this.data.map.gate.hp - gateBefore;
    if (gateDelta !== 0) for (const fn of this.onGateMaxHpChanged) fn(gateDelta);

    this.taken.set(perkId, stacks + 1);
    this.offer = null;
    for (const fn of this.onTaken) fn(perk, stacks + 1);
    this.dealFromQueue();
    return true;
  }

  /** Decline the draft. The card is spent; the run moves on. */
  skip(): void {
    this.offer = null;
    this.dealFromQueue();
  }
}
