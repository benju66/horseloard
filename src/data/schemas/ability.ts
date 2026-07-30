import { z } from 'zod';
import { IdSchema, SfxRefSchema, SpriteRefSchema } from './common';

/**
 * Ability effects the engine implements. All are cast at/from the hero
 * position — no global tap-anywhere targeting (DESIGN §4).
 */
export const AbilityEffectSchema = z.discriminatedUnion('type', [
  // Volley: arrow rain centered on the hero.
  z.object({
    type: z.literal('aoe-damage'),
    damage: z.number().positive(),
    radius: z.number().positive().describe('world units around the hero'),
  }),
  // Rally Horn: all towers fire faster for a duration.
  z.object({
    type: z.literal('tower-rate-buff'),
    rateMultiplier: z.number().gt(1).describe('1.5 = +50% fire rate'),
    duration: z.number().positive().describe('seconds'),
  }),
  // Charge: gallop burst, tramples through enemies.
  z.object({
    type: z.literal('charge'),
    duration: z.number().positive().describe('seconds of burst'),
    speedMultiplier: z.number().gt(1),
    damage: z.number().positive().describe('per enemy trampled (internal cooldown per enemy)'),
    slowMultiplier: z.number().gt(0).lt(1).describe('speed factor applied to trampled enemies'),
    slowDuration: z.number().positive().describe('seconds'),
  }),
]);
export type AbilityEffect = z.infer<typeof AbilityEffectSchema>;

export const AbilitySchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  cooldown: z.number().positive().describe('seconds'),
  unlockedByDefault: z
    .boolean()
    .describe('Charge is free from the start; others unlock via meta-tree nodes'),
  effect: AbilityEffectSchema,
  iconRef: SpriteRefSchema,
  castSfxRef: SfxRefSchema.optional(),
});
export type Ability = z.infer<typeof AbilitySchema>;

/** abilities.json */
export const AbilitiesFileSchema = z
  .object({
    abilities: z.array(AbilitySchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.abilities.forEach((a, i) => {
      if (seen.has(a.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['abilities', i, 'id'],
          message: `duplicate ability id "${a.id}"`,
        });
      }
      seen.add(a.id);
    });
  });
export type AbilitiesFile = z.infer<typeof AbilitiesFileSchema>;
