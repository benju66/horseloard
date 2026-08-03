import { z } from 'zod';
import { IdSchema, SfxRefSchema, SpriteRefSchema } from './common';

/** One purchasable bow level at the forge. `cost` is coins to ENTER the level; level 1 costs 0 (starting kit). */
export const BowLevelSchema = z.object({
  cost: z.number().int().nonnegative(),
  damage: z.number().positive(),
  fireInterval: z.number().positive().describe('seconds between shots'),
  range: z.number().positive().describe('world units'),
});
export type BowLevel = z.infer<typeof BowLevelSchema>;

/**
 * hero.json — all hero balance. In-run forge levels reset each run; the
 * meta tree layers persistent modifiers on top of these bases (M3).
 */
export const HeroSchema = z.object({
  /** Model manifest id (models.json). See the note on EnemySchema.model. */
  model: IdSchema.optional(),
  moveSpeed: z.number().positive().describe('world units per second'),
  radius: z.number().positive().describe('contact radius, world units'),
  margins: z
    .object({
      x: z.number().nonnegative(),
      top: z.number().nonnegative(),
      bottom: z.number().nonnegative(),
    })
    .describe('movement clamp insets from the world edges (HUD safe zones)'),
  bow: z.object({
    projectile: z.object({
      speed: z.number().positive(),
      spriteRef: SpriteRefSchema,
      hitSfxRef: SfxRefSchema.optional(),
      ignoresArmor: z
        .boolean()
        .default(false)
        .describe(
          'whether the hero’s own shots bypass armor. Data, not a constant, because it ' +
            'decides whether armor is a tower-composition lever or a flat tax on the ' +
            'player’s baseline damage — see DESIGN §6 option A.',
        ),
    }),
    levels: z.array(BowLevelSchema).min(1).describe('forge upgrade track; index 0 = starting bow'),
  }),
  trample: z
    .object({
      damage: z.number().positive(),
      perEnemyCooldown: z.number().positive().describe('seconds before the same enemy can be trampled again'),
    })
    .describe('contact damage while the hero is moving (DESIGN §4)'),
  stagger: z
    .object({
      controlLossDuration: z.number().positive().describe('seconds of lost control (~0.4)'),
      shoveDistance: z.number().positive().describe('world units of knockback over the control loss'),
      perEnemyCooldown: z.number().positive().describe('seconds before the same enemy can stagger the hero again'),
      /**
       * Grace period after a shove ends, during which nothing can shove again.
       *
       * Inherited the job Charge used to do. Charge was "the escape tool that
       * pairs with stagger" (DESIGN §4) and was cut on repeated play feedback;
       * with abilities firing themselves there is no button left to escape
       * with, so the counterplay has to be passive. Without it, riding into two
       * heavies is a shove, a recovery, and another shove, with nothing the
       * player can do about any of it.
       */
      immunityAfter: z.number().nonnegative().default(0.9).describe('seconds of grace after a shove'),
    })
    .describe('received from staggersHero enemies on contact; the hero cannot die'),
});
export type Hero = z.infer<typeof HeroSchema>;
