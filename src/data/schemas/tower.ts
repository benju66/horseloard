import { z } from 'zod';
import { IdSchema, SfxRefSchema, SpriteRefSchema } from './common';

/** The small enum set the engine implements. 'none' = non-attacking tower (Mill). */
export const TargetingModeSchema = z.enum(['nearest', 'first', 'strongest', 'none']);
export type TargetingMode = z.infer<typeof TargetingModeSchema>;

const projectileBase = {
  id: IdSchema,
  spriteRef: SpriteRefSchema,
  hitSfxRef: SfxRefSchema.optional(),
};

/**
 * The four projectile behaviors the engine implements (DESIGN §5).
 * Status effects (slow, stun, crit) arrive with Frost Spire/branches in M1 as
 * optional fields on these variants — additive, non-breaking.
 */
export const ProjectileSchema = z.discriminatedUnion('behavior', [
  z.object({
    ...projectileBase,
    behavior: z.literal('ballistic'),
    speed: z.number().positive().describe('world units per second'),
  }),
  z.object({
    ...projectileBase,
    behavior: z.literal('instant'),
  }),
  z.object({
    ...projectileBase,
    behavior: z.literal('aoe'),
    speed: z.number().positive().describe('world units per second'),
    radius: z.number().positive().describe('blast radius, world units'),
  }),
  z.object({
    ...projectileBase,
    behavior: z.literal('aura'),
    radius: z.number().positive().describe('aura radius, world units'),
    tickInterval: z.number().positive().describe('seconds between aura applications'),
  }),
]);
export type Projectile = z.infer<typeof ProjectileSchema>;

export const TowerStatsSchema = z.object({
  damage: z.number().nonnegative(),
  range: z.number().positive().describe('world units'),
  fireInterval: z.number().positive().describe('seconds between shots'),
});
export type TowerStats = z.infer<typeof TowerStatsSchema>;

/** One purchasable level. `cost` is the price to ENTER this level, so levels[0].cost is the build cost. */
export const TowerLevelSchema = TowerStatsSchema.extend({
  cost: z.number().int().positive().describe('coins to enter this level; levels[0].cost = build cost'),
});
export type TowerLevel = z.infer<typeof TowerLevelSchema>;

/** A Lv4 specialization. Picking one is the 3→4 upgrade (per tower instance). */
export const TowerBranchSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().int().positive().describe('coins for the 3→4 branch upgrade'),
  stats: TowerStatsSchema,
  projectileId: IdSchema.optional().describe('override of the tower projectile (e.g. Cluster bomblets)'),
});
export type TowerBranch = z.infer<typeof TowerBranchSchema>;

export const TowerSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  targeting: TargetingModeSchema,
  projectileId: IdSchema.nullable().describe('null only for non-attacking towers (targeting "none")'),
  levels: z
    .array(TowerLevelSchema)
    .length(3)
    .describe('levels 1–3; level 4 is the branch choice below'),
  branches: z
    .array(TowerBranchSchema)
    .length(2)
    .describe('the Lv4 specialization pair — exactly two, pick one per instance'),
  spriteRef: SpriteRefSchema,
  fireSfxRef: SfxRefSchema.optional(),
});
export type Tower = z.infer<typeof TowerSchema>;

/** towers.json: shared projectile defs + the tower roster. */
export const TowersFileSchema = z
  .object({
    projectiles: z.array(ProjectileSchema),
    towers: z.array(TowerSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const projectileIds = new Set(file.projectiles.map((p) => p.id));
    const seenTowerIds = new Set<string>();

    file.projectiles.forEach((p, i) => {
      if (file.projectiles.findIndex((q) => q.id === p.id) !== i) {
        ctx.addIssue({
          code: 'custom',
          path: ['projectiles', i, 'id'],
          message: `duplicate projectile id "${p.id}"`,
        });
      }
    });

    file.towers.forEach((tower, i) => {
      if (seenTowerIds.has(tower.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['towers', i, 'id'],
          message: `duplicate tower id "${tower.id}"`,
        });
      }
      seenTowerIds.add(tower.id);

      if (tower.targeting === 'none') {
        if (tower.projectileId !== null) {
          ctx.addIssue({
            code: 'custom',
            path: ['towers', i, 'projectileId'],
            message: 'towers with targeting "none" must have projectileId null',
          });
        }
      } else if (tower.projectileId === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['towers', i, 'projectileId'],
          message: `attacking tower "${tower.id}" needs a projectileId`,
        });
      } else if (!projectileIds.has(tower.projectileId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['towers', i, 'projectileId'],
          message: `unknown projectile "${tower.projectileId}" (known: ${[...projectileIds].join(', ')})`,
        });
      }

      tower.branches.forEach((branch, j) => {
        if (branch.projectileId !== undefined && !projectileIds.has(branch.projectileId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['towers', i, 'branches', j, 'projectileId'],
            message: `unknown projectile "${branch.projectileId}" (known: ${[...projectileIds].join(', ')})`,
          });
        }
      });
    });
  });
export type TowersFile = z.infer<typeof TowersFileSchema>;
