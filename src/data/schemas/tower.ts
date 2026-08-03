import { z } from 'zod';
import { IdSchema, SfxRefSchema, SpriteRefSchema } from './common';

/** The small enum set the engine implements. 'none' = non-attacking tower (Mill). */
export const TargetingModeSchema = z.enum(['nearest', 'first', 'strongest', 'none']);
export type TargetingMode = z.infer<typeof TargetingModeSchema>;

const projectileBase = {
  id: IdSchema,
  spriteRef: SpriteRefSchema,
  hitSfxRef: SfxRefSchema.optional(),
  ignoresArmor: z
    .boolean()
    .default(false)
    .describe(
      'true = armor does not reduce this damage (DESIGN §6 option A). Explosive and ' +
        'magic ignore armor; physical does not. Lives on the projectile rather than the ' +
        'tower because damage is applied where the projectile lands, and a branch can ' +
        'change the damage type without changing the tower.',
    ),
};

/** A movement debuff: factor 0 = frozen/stunned, 0.5 = half speed. */
export const SlowEffectSchema = z.object({
  factor: z.number().min(0).lt(1),
  duration: z.number().positive().describe('seconds'),
});
export type SlowEffect = z.infer<typeof SlowEffectSchema>;

/** The four projectile behaviors the engine implements (DESIGN §5). */
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
    stun: SlowEffectSchema.optional().describe('applied to everything in the blast (Concussion)'),
    bomblets: z
      .object({
        count: z.number().int().positive(),
        damage: z.number().positive(),
        radius: z.number().positive(),
        spread: z.number().positive().describe('max offset of each sub-blast from the impact'),
      })
      .optional()
      .describe('secondary explosions around the impact (Cluster)'),
  }),
  z.object({
    ...projectileBase,
    behavior: z.literal('aura'),
    radius: z.number().positive().describe('aura radius, world units'),
    tickInterval: z.number().positive().describe('seconds between aura pulses'),
    slow: SlowEffectSchema.optional().describe('applied per pulse (Frost; factor 0 = Deep Freeze)'),
    vulnerability: z
      .number()
      .gt(1)
      .optional()
      .describe('damage multiplier on enemies while slowed by this aura (Brittle)'),
  }),
]);
export type Projectile = z.infer<typeof ProjectileSchema>;

export const TowerStatsSchema = z.object({
  damage: z.number().nonnegative().describe('per shot, or per pulse for auras'),
  range: z.number().positive().describe('world units'),
  fireInterval: z.number().positive().describe('seconds between shots (auras use the def tickInterval)'),
  crit: z
    .object({
      chance: z.number().gt(0).lte(1),
      multiplier: z.number().gt(1),
    })
    .optional()
    .describe('critical hits (Sniper)'),
  income: z
    .object({
      value: z.number().int().positive(),
      interval: z.number().positive().describe('seconds between coin drops'),
    })
    .optional()
    .describe('economy towers: coins dropped beside the tower (Mill)'),
  towerAura: z
    .object({
      radius: z.number().positive(),
      damageMultiplier: z.number().gt(1),
    })
    .optional()
    .describe('buffs the damage of other towers in radius (Beacon)'),
  /**
   * The army pillar (TRIANGLE.md §B.2). A tower with a garrison posts soldiers
   * on the nearest lane; an enemy that meets one stops advancing and fights.
   *
   * The numbers here are deliberately shaped so this cannot become a damage
   * source. `damage` is low and `attackInterval` long: soldiers supply
   * **exposure**, which is a different factor from rate, and two systems
   * producing different factors are complements rather than substitutes. If a
   * squad ever kills a wave on its own it has stopped being the third pillar
   * and become a fourth tower.
   *
   * One soldier holds one enemy. That makes `squad` the exposure dial, and it
   * means a big enough wave simply walks past — which is the property that
   * keeps the army from clearing a map alone.
   */
  garrison: z
    .object({
      squad: z.number().int().positive().describe('soldiers posted at once'),
      hp: z.number().positive(),
      damage: z.number().positive().describe('per attack — keep this small'),
      attackInterval: z.number().positive().describe('seconds between attacks'),
      respawn: z.number().positive().describe('seconds to replace a fallen soldier'),
      rallyRange: z
        .number()
        .positive()
        .describe('how far from the plot a lane may be for soldiers to post on it'),
      engageRadius: z
        .number()
        .positive()
        .describe('how far from its post a soldier will step to grab an enemy'),
      spacing: z.number().positive().describe('gap between posts along the lane'),
    })
    .optional(),
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
  /**
   * Buildable on a fresh save. Defaults true so adding the field does not
   * silently lock the existing roster; a tower opts out, exactly like
   * `targetsFlying` below.
   *
   * The barracks opts out: the army is the pillar you *earn*, which is what
   * gives the meta tree something to grant now that it grants no stats
   * (TRIANGLE.md §B.6).
   */
  unlockedByDefault: z.boolean().default(true),
  targetsFlying: z
    .boolean()
    .default(true)
    .describe(
      'false = this tower cannot engage airborne enemies at all. Defaults true so adding ' +
        'the field does not silently ground the existing roster; a tower opts out.',
    ),
  levels: z
    .array(TowerLevelSchema)
    .length(3)
    .describe('levels 1–3; level 4 is the branch choice below'),
  branches: z
    .array(TowerBranchSchema)
    .length(2)
    .describe('the Lv4 specialization pair — exactly two, pick one per instance'),
  spriteRef: SpriteRefSchema,
  /** Model manifest id (models.json). See the note on EnemySchema.model. */
  model: IdSchema.optional(),
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
        // Non-targeting towers: no projectile (Mill) or an aura def (Frost Spire).
        const ref = tower.projectileId;
        if (ref !== null) {
          const def = file.projectiles.find((p) => p.id === ref);
          if (!def) {
            ctx.addIssue({
              code: 'custom',
              path: ['towers', i, 'projectileId'],
              message: `unknown projectile "${ref}" (known: ${[...projectileIds].join(', ')})`,
            });
          } else if (def.behavior !== 'aura') {
            ctx.addIssue({
              code: 'custom',
              path: ['towers', i, 'projectileId'],
              message: 'towers with targeting "none" may only reference aura projectiles (or null)',
            });
          }
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
