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
  /**
   * Rapid Fire: temporarily multiply one of the hero's own stats.
   *
   * The shape that makes the hero a burst pillar rather than a sustain one
   * (TRIANGLE.md §B.3). A buff on a cooldown has a hard ceiling on
   * damage-per-minute — `multiplier × duration / cooldown` — that no amount of
   * stacking can lift past, which is exactly what the bow could not do.
   */
  z.object({
    type: z.literal('hero-buff'),
    stat: z.enum(['bowDamage', 'bowFireRate', 'moveSpeed']),
    multiplier: z.number().gt(1),
    duration: z.number().positive().describe('seconds'),
  }),
  /**
   * Heavy Shaft: one heavy arrow that punches through everything in a line.
   *
   * Instant and directional rather than a projectile — it is cast along the
   * hero's facing, so it rewards lining a lane up, which is a positioning
   * decision rather than an aiming one (DESIGN §1 pillar 2: no twitch aiming).
   */
  z.object({
    type: z.literal('pierce-shot'),
    damage: z.number().positive(),
    range: z.number().positive().describe('world units along the hero facing'),
    halfWidth: z.number().positive().describe('how far either side of the line it still connects'),
  }),
  /**
   * Caltrops: leave a patch of ground that hurts and slows what walks over it.
   *
   * The third shape a burst pillar needs (TRIANGLE.md §B.3). Volley and Heavy
   * Shaft answer "what is in front of me right now"; a zone answers "what is
   * about to walk here", which is the only hero tool that pays off *before* the
   * enemies arrive. That makes it the hero's contribution to holding a lane
   * rather than to clearing one, and it is what pairs with the army in M5.4.
   *
   * Cast at the hero position like everything else — the placement decision is
   * where you ride, not where you tap (DESIGN §4).
   */
  z.object({
    type: z.literal('ground-zone'),
    radius: z.number().positive().describe('world units'),
    duration: z.number().positive().describe('seconds the patch persists'),
    damagePerSecond: z.number().nonnegative(),
    slowMultiplier: z.number().gt(0).lte(1).describe('1 = no slow'),
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
    /**
     * How many abilities the hero may carry at once (DESIGN §4: "up to three").
     *
     * This is the cap that makes the hero a burst pillar rather than a sustain
     * one, and it took a measurement to find. A cooldown bounds *one* ability's
     * damage-per-minute; the hero's total is the sum over everything equipped,
     * so a roster that grows without a cap is a sustain engine assembled out of
     * burst parts — the harness measured hero-only climbing back to 33% and 58%
     * on maps 3–4 the moment three more abilities became draftable. The cap is
     * what makes "which three" a decision instead of "all of them".
     */
    equipSlots: z.number().int().positive().default(3),
    abilities: z.array(AbilitySchema).min(1),
  })
  .superRefine((file, ctx) => {
    const defaults = file.abilities.filter((a) => a.unlockedByDefault).length;
    if (defaults > file.equipSlots) {
      ctx.addIssue({
        code: 'custom',
        path: ['equipSlots'],
        message: `${defaults} abilities are unlocked by default but only ${file.equipSlots} can be carried`,
      });
    }
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
