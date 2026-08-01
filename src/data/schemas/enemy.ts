import { z } from 'zod';
import { IdSchema, SpriteRefSchema } from './common';

export const EnemySchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  hp: z.number().positive(),
  speed: z.number().positive().describe('world units per second along the lane'),
  radius: z.number().positive().describe('body radius, world units (contact + render)'),
  coinValue: z.number().int().nonnegative().describe('coins dropped on death'),
  siegeDps: z
    .number()
    .positive()
    .describe('gate damage per second while besieging — leaks never despawn (DESIGN §6)'),
  staggersHero: z
    .boolean()
    .describe('heavy enemies shove the hero on contact: knockback + ~0.4s control loss'),
  eliteEligible: z.boolean().describe('can spawn crowned (elite modifier)'),
  frontalBlock: z
    .object({
      arcDegrees: z.number().gt(0).lte(360),
      multiplier: z.number().min(0).lt(1).describe('damage factor for hits from the front'),
    })
    .optional()
    .describe('Shieldbearer: reduced damage from sources ahead of it — flank it or shoot it from behind'),
  ignoresSlows: z.boolean().optional().describe('Wolf Rider: immune to slows and freezes'),
  lootsCoins: z
    .object({
      detectRadius: z.number().positive(),
      fleeSpeedMultiplier: z.number().gte(1),
    })
    .optional()
    .describe('Looter: beelines for ground coins and flees back up the lane with them'),
  warCry: z
    .object({
      radius: z.number().positive(),
      speedMultiplier: z.number().gt(1),
      duration: z.number().positive(),
      interval: z.number().positive().describe('seconds between cries'),
    })
    .optional()
    .describe('Warlord: periodically hastes every other enemy in radius'),
  towerBreak: z
    .object({
      radius: z.number().positive(),
      cooldown: z.number().positive().describe('seconds between breaks per plot'),
    })
    .optional()
    .describe('Warlord: knocks a tower down one level when it stomps past'),
  spriteRef: SpriteRefSchema,
  /**
   * Model manifest id (models.json). Optional during the 3D migration so the
   * Phaser build keeps working off spriteRef; the renderer falls back to
   * placeholder geometry when absent. Replaces spriteRef at MG.7.
   */
  model: IdSchema.optional(),
});
export type Enemy = z.infer<typeof EnemySchema>;

/** One multiplier system over the whole roster (DESIGN §6). */
export const EliteConfigSchema = z.object({
  chance: z.number().min(0).max(1).describe('base spawn chance per eligible enemy (~1 in 12)'),
  hpMultiplier: z.number().gt(1),
  coinMultiplier: z.number().gt(1),
});
export type EliteConfig = z.infer<typeof EliteConfigSchema>;

/** enemies.json: elite dials + the roster. */
export const EnemiesFileSchema = z
  .object({
    elite: EliteConfigSchema,
    enemies: z.array(EnemySchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.enemies.forEach((e, i) => {
      if (seen.has(e.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['enemies', i, 'id'],
          message: `duplicate enemy id "${e.id}"`,
        });
      }
      seen.add(e.id);
    });
  });
export type EnemiesFile = z.infer<typeof EnemiesFileSchema>;
