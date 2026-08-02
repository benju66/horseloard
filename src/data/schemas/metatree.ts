import { z } from 'zod';
import { IdSchema } from './common';

export const MetaBranchSchema = z.enum(['hero', 'towers', 'kingdom']);
export type MetaBranch = z.infer<typeof MetaBranchSchema>;

/** Closed stat enums so a typo'd stat fails at boot, not silently no-ops. Extend as systems land. */
export const HeroStatSchema = z.enum([
  'moveSpeed',
  'bowDamage',
  'bowFireRate',
  'bowRange',
  'trampleDamage',
  'staggerResist',
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
    ]),
  }),
  z.object({ type: z.literal('unlock-ability'), abilityId: IdSchema }),
  z.object({ type: z.literal('unlock-tower'), towerId: IdSchema }),
]);
export type MetaEffect = z.infer<typeof MetaEffectSchema>;

export const MetaNodeSchema = z.object({
  id: IdSchema,
  branch: MetaBranchSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  costPerRank: z
    .array(z.number().int().positive())
    .min(1)
    .describe('token cost per rank; array length = max rank'),
  requires: z.array(IdSchema).default([]).describe('node ids that must be at max rank first'),
  effect: MetaEffectSchema,
});
export type MetaNode = z.infer<typeof MetaNodeSchema>;

/** metatree.json. Free respec always — no refund math lives in data. */
export const MetaTreeFileSchema = z
  .object({
    nodes: z.array(MetaNodeSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    file.nodes.forEach((n, i) => {
      if (ids.has(n.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', i, 'id'],
          message: `duplicate node id "${n.id}"`,
        });
      }
      ids.add(n.id);
    });
    const all = new Set(file.nodes.map((n) => n.id));
    file.nodes.forEach((n, i) => {
      n.requires.forEach((req, j) => {
        if (!all.has(req)) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', i, 'requires', j],
            message: `unknown node id "${req}" in requires`,
          });
        }
        if (req === n.id) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', i, 'requires', j],
            message: `node "${n.id}" cannot require itself`,
          });
        }
      });
    });
  });
export type MetaTreeFile = z.infer<typeof MetaTreeFileSchema>;
