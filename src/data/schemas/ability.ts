import { z } from 'zod';
import { IdSchema, SfxRefSchema, SpriteRefSchema } from './common';

/**
 * When an ability fires itself.
 *
 * **Abilities are not buttons.** DESIGN §1 pillar 2 says "auto-fire means the
 * thumb steers and the brain plays", and that was applied to the bow while a
 * three-button ability bar was bolted onto the other thumb — a direct
 * contradiction nobody had noticed. Abilities now fire on their own, so the
 * whole game is one thumb on a joystick and the decisions live in the build.
 *
 * The condition is the interesting part. `cooldown` alone dumps a Volley into
 * an empty field the instant it comes up; `enemies-near` waits for something
 * worth spending it on. That heuristic is not new — the bot harness has been
 * playing exactly this way since M1, which in hindsight was the game telling us
 * it wanted to play itself.
 */
export const AbilityTriggerSchema = z.discriminatedUnion('type', [
  /** Fire the moment it is off cooldown. For buffs and anything always useful. */
  z.object({ type: z.literal('cooldown') }),
  /** Fire when at least `count` enemies are within `radius` of the hero. */
  z.object({
    type: z.literal('enemies-near'),
    count: z.number().int().positive(),
    radius: z.number().positive(),
  }),
  /** Fire once the hero has dealt this much damage since the last cast. */
  z.object({ type: z.literal('damage-dealt'), amount: z.number().positive() }),
]);
export type AbilityTrigger = z.infer<typeof AbilityTriggerSchema>;

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
  /**
   * The Muster: the gates open and a host marches up the road.
   *
   * Spectacle, and the hero's one direct contribution to the army's factor. It
   * exists as a separate effect from the barracks (TRIANGLE.md §B.2) because
   * the barracks does the *routine* work — a thing that happens continuously
   * cannot also be the moment people remember. Soldiers spawn at the gate and
   * hold the road until they fall; they are never replaced, which is what keeps
   * this a burst rather than a second garrison.
   */
  z.object({
    // Named for the mechanic, not the ability. `muster` would collide with the
    // ability's own id, and `substrate.test.ts` records what that costs: an
    // engine enum that matches a content id is a literal the guard can no
    // longer police, silently.
    type: z.literal('summon-host'),
    squad: z.number().int().positive(),
    hp: z.number().positive(),
    damage: z.number().positive(),
    attackInterval: z.number().positive(),
    lifetime: z.number().positive().describe('seconds before the host disperses'),
    engageRadius: z.number().positive(),
    spacing: z.number().positive(),
  }),
  /**
   * Orbiting blades — the one shape the roster completely lacked.
   *
   * Everything else fires forward or lands where the hero already is. Nothing
   * defended the space *around* you, which is exactly the situation Charge was
   * supposed to answer and never did. An orbit is the classic survivor-game
   * answer: it needs no aim, no timing and no button, and it rewards riding
   * *through* a crowd rather than away from it — which is DESIGN §1 pillar 1
   * ("greed pulls you toward danger") expressed as a weapon.
   *
   * Implemented as zones that follow the hero, so it reuses the hazard
   * machinery rather than adding a third way to damage something.
   */
  z.object({
    type: z.literal('orbit'),
    blades: z.number().int().positive(),
    radius: z.number().positive().describe('distance from the hero'),
    bladeRadius: z.number().positive().describe('how far each blade reaches'),
    revolutionsPerSecond: z.number().positive(),
    damagePerSecond: z.number().positive(),
    duration: z.number().positive().describe('seconds the blades persist'),
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
    .describe('available on a fresh save; the rest unlock via meta-tree nodes'),
  /** When this fires itself. Defaults to "the moment it is ready". */
  trigger: AbilityTriggerSchema.default({ type: 'cooldown' }),
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
    /**
     * Campaign milestones that each grant one more slot (SKILLTREE.md B).
     *
     * Slot growth is a *campaign* reward rather than a tree node on purpose: it
     * cannot be rushed by grinding, and it cannot be double-dipped by a build.
     * Each entry is a count of maps cleared; a career that has cleared that
     * many carries one extra ability.
     */
    equipSlotGrants: z.array(z.number().int().positive()).default([]),
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
