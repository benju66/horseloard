import { z } from 'zod';
import { IdSchema } from './common';

/**
 * The shared effect vocabulary — what a node, of any kind, is allowed to *do*.
 *
 * This file was `metatree.ts` until M6.2, when the meta tree was retired into
 * the career tree (SKILLTREE.md A.2). What survived the retirement is the part
 * that was never really about the meta tree at all: a closed set of stat keys
 * and a discriminated union of effects, which is what makes "+12% bow damage"
 * mean exactly one thing no matter which screen granted it.
 *
 * Closed enums throughout, so a typo'd stat is a boot failure rather than a
 * node that silently does nothing — the single worst bug class in a build game,
 * because it is invisible from inside the game.
 */

/** Closed stat enums so a typo'd stat fails at boot, not silently no-ops. Extend as systems land. */
export const HeroStatSchema = z.enum([
  'moveSpeed',
  'bowDamage',
  'bowFireRate',
  'bowRange',
  'trampleDamage',
  'staggerResist',
  /** Seconds of grace after a shove — the passive that replaced Charge. */
  'staggerImmunity',
  /** Chance and multiplier for the hero's own bow crits. */
  'bowCritChance',
  'bowCritMultiplier',
  /**
   * Damage multiplier against enemies that are slowed *or* held by a soldier.
   *
   * The tree's main synergy hook. It is worth nothing on its own and a great
   * deal beside a frost spire or a barracks, which is exactly the property
   * that makes five columns feel like one build — see SkillKindSchema.
   */
  'bowDamageVsHindered',
]);
export const KingdomStatSchema = z.enum([
  'startingGold',
  'gateMaxHp',
  'repairCost',
  'coinMagnetRadius',
  'coinExpiryTime',
  'waveClearBonus',
  'wavePreviewDetail',
]);
export const TowerStatKeySchema = z.enum(['damage', 'range', 'fireRate', 'cost']);
/**
 * The tunable numbers on an ability. Not every ability has every one — a
 * `radius` means nothing to Heavy Shaft — so `loader.ts` rejects an
 * `ability-stat` naming a stat the target ability does not actually carry.
 * Silence would be worse than a boot failure: an upgrade card that does
 * nothing is indistinguishable from one that does.
 */
export const AbilityStatKeySchema = z.enum([
  'cooldown',
  'damage',
  'damagePerSecond',
  'radius',
  'duration',
  'range',
  'blades',
  /** Bodies in a summoned host, and how long they stand before dispersing. */
  'squad',
  'lifetime',
]);
export type AbilityStatKey = z.infer<typeof AbilityStatKeySchema>;

/**
 * **Rules.** Effects that change what the game *does*, not what a number is.
 *
 * Everything above multiplies something. That was the whole vocabulary until
 * M7.6, and it is why two whole paths measured as dead: no quantity of "+18%
 * soldier hp" can ever be exciting, and ranking a boring node three times only
 * buys three times the boredom. A tree is deep when its nodes are *rules* —
 * things you have to build around rather than things you add up.
 *
 * These are engine vocabulary, not content, exactly like the effect types
 * themselves: `pierce-on-kill` names a mechanic. The substrate rule is intact —
 * no rule here knows what an archer or a grunt is.
 *
 * Each is deliberately cheap: every one is reachable through machinery the
 * engine already had, which is why eight of them cost less than one new system.
 */
export const RuleKeySchema = z.enum([
  /** A hero arrow that kills carries on to the next enemy behind it. */
  'pierce-on-kill',
  /** Every hero shot at a slowed or held enemy lands as a critical. */
  'crit-vs-hindered',
  /** Enemies standing in your ground zones lose their armour. */
  'zones-strip-armor',
  /** The first tower raised in each build phase is free. */
  'first-tower-free',
  /** Every fallen soldier returns the instant a wave is cleared. */
  'soldiers-reform',
  /** Enemies killed while a soldier holds them pay a bounty. */
  'bounty-on-blocked',
  /** Coins on the ground never expire, even mid-combat. */
  'coins-never-expire',
  /** Selling a tower returns everything invested in it. */
  'full-salvage',
]);
export type RuleKey = z.infer<typeof RuleKeySchema>;

/**
 * **Scaling.** Power that grows with something *else* you built.
 *
 * The third and last shape a node can take, and the one that decides whether
 * six paths are six playstyles. Stats and rules are both unconditional: "+20%
 * bow damage" is correct in every build that ever existed, which is precisely
 * why the paths that supply damage directly measured at 100% and the paths that
 * supply gold and exposure measured at 13%.
 *
 * A scaling node is worth nothing on its own and a great deal beside the right
 * board. That is the Slay the Spire lesson — you do not balance cards against
 * each other, you make a card's value depend on the deck — and it is the only
 * mechanism that makes a *complement* path competitive with a *substitute* one
 * without simply inflating its numbers.
 *
 * Evaluated live, every time the number is used, so these can never be folded
 * into the balance data the way a stat is.
 */
export const ScaleKeySchema = z.enum([
  /** Towers hit harder for every soldier currently standing. Wall wants Host. */
  'tower-damage-per-soldier',
  /** Towers hit harder per 100 gold banked. Crown becomes a build, not a convenience. */
  'tower-damage-per-100-gold',
  /** The bow hits harder for every tower covering its target. Hunt wants Wall. */
  'bow-damage-per-covering-tower',
  /** Ground zones hit harder for every enemy standing in them. Storm wants crowds. */
  'zone-damage-per-enemy-inside',
  /** Soldiers hit harder for every other soldier standing. Host wants Host. */
  'soldier-damage-per-soldier',
  /** The hero hits harder for every coin left lying on the ground. Greed, priced. */
  'bow-damage-per-loose-coin',
]);
export type ScaleKey = z.infer<typeof ScaleKeySchema>;

const statModFields = {
  perRank: z.number().describe('applied once per purchased rank'),
  mode: z.enum(['add', 'multiply']),
};

export const MetaEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hero-stat'), stat: HeroStatSchema, ...statModFields }),
  z.object({ type: z.literal('kingdom-stat'), stat: KingdomStatSchema, ...statModFields }),
  z.object({
    type: z.literal('tower-stat'),
    towerId: IdSchema.nullable().describe('null = applies to all towers'),
    stat: TowerStatKeySchema,
    ...statModFields,
  }),
  /**
   * Give towers a mechanic they did not have, rather than scaling one they did.
   *
   * `crit`, `towerAura` and `income` are all optional on TowerStats and read
   * per-plot by TowerSystem, so granting one to a tower that shipped without it
   * changes what that tower *does* — the only effect type here that is a rule
   * change rather than a number. Granting to a tower that already has the
   * mechanic adds to it instead.
   *
   * This exists because a pool of pure stat multipliers makes a draft a
   * preference, not a decision (DESIGN §15.1).
   */
  z.object({
    type: z.literal('tower-grant'),
    towerId: IdSchema.nullable().describe('null = applies to all towers'),
    grant: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('crit'),
        chance: z.number().gt(0).lte(1),
        multiplier: z.number().gt(1),
      }),
      z.object({
        kind: z.literal('aura'),
        radius: z.number().positive(),
        damageMultiplier: z.number().gt(1),
      }),
      z.object({
        kind: z.literal('income'),
        value: z.number().int().positive(),
        interval: z.number().positive().describe('seconds between coin drops'),
      }),
      /**
       * Scale a garrison — the army pillar's draft lever.
       *
       * Unlike the other grants this one only ever *scales*: it will not give a
       * garrison to a tower that shipped without one. A card that turned every
       * tower into a barracks would make the army free rather than a build
       * decision, and the pillar's whole job is to cost a plot.
       */
      z.object({
        kind: z.literal('garrison'),
        squad: z.number().int().nonnegative().describe('extra soldiers per rank'),
        hpMultiplier: z.number().positive(),
        damageMultiplier: z.number().positive(),
        respawnMultiplier: z.number().positive().default(1),
        engageRadiusMultiplier: z.number().positive().default(1),
      }),
    ]),
  }),
  /**
   * Scale one number on one ability (or the same number on all of them).
   *
   * The other half of TRIANGLE.md §B.6: if the draft is the ability tree, then
   * "you already have Volley" has to have an answer better than a dead card.
   * `cooldown` is the load-bearing one — a burst pillar's whole output is
   * `burst / cooldown`, so shortening it is the only lever that raises the
   * hero's ceiling, and it is deliberately the only lever that does.
   */
  z.object({
    type: z.literal('ability-stat'),
    abilityId: IdSchema.nullable().describe('null = applies to every ability that has the stat'),
    stat: AbilityStatKeySchema,
    ...statModFields,
  }),
  z.object({ type: z.literal('unlock-ability'), abilityId: IdSchema }),
  z.object({ type: z.literal('unlock-tower'), towerId: IdSchema }),
  /**
   * A rule, on or off. No `perRank`: a rule that applied "1.4 times" would not
   * be a rule, and the moment ranks land this is the effect type that must stay
   * rank-blind or the whole distinction collapses.
   */
  z.object({ type: z.literal('rule'), rule: RuleKeySchema }),
  /**
   * Scaling. `perUnit` is the fraction added per unit counted, so 0.04 is
   * "+4% each". Multiple nodes on the same key sum, which is what lets a path
   * deepen a single relationship rather than adding six unrelated ones.
   */
  z.object({
    type: z.literal('scaling'),
    scale: ScaleKeySchema,
    perUnit: z.number().positive(),
    /** Cap on the multiplier, so a runaway board cannot reach infinity. */
    max: z.number().gt(1).default(3),
  }),
]);
export type MetaEffect = z.infer<typeof MetaEffectSchema>;
