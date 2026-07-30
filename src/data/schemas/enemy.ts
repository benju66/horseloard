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
  spriteRef: SpriteRefSchema,
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
