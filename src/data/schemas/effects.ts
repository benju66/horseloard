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
]);
export type MetaEffect = z.infer<typeof MetaEffectSchema>;
