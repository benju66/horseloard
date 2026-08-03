import { z } from 'zod';
import { IdSchema } from './common';
import { MetaEffectSchema } from './metatree';

/**
 * In-run draft perks — DESIGN §15.1, "survivor-style pick-1-of-3 on wave
 * clears", activated because its trigger condition was met: the bot harness
 * measured tower composition as *preference rather than decision* (BACKLOG,
 * "Solo-carry still unsolved on maps 3-4"), which is the same finding as
 * "runs feel samey" arrived at from the other direction.
 *
 * **A perk is a meta-tree node that applies mid-run instead of pre-run.** It
 * reuses `MetaEffectSchema` outright rather than inventing a parallel effect
 * vocabulary, so "+15% bow damage" means exactly one thing in this game and is
 * implemented exactly once (`applyEffectInPlace`). A new perk is a JSON entry
 * and nothing else — the substrate rule, applied to progression.
 *
 * Perks are deliberately *additive* to the existing run economy (gold, bow
 * levels, tower upgrades) rather than replacing any of it. Whether drafting
 * should eventually absorb bow levels — which are currently just a gold sink —
 * is a live design question; keeping perks additive means answering it later is
 * a data change, not a refactor.
 */

/**
 * Stats that cannot move mid-run, with the reason. Enforced at load rather than
 * left as lore, because the failure is silent: the perk would appear in a draft,
 * be picked, and do nothing at all.
 */
const NOT_MID_RUN: Record<string, string> = {
  // Starting gold is granted once, when the run is built. Raising it later
  // changes a number nothing reads again.
  startingGold: 'granted at run start; raising it mid-run has no effect',
};

export const PerkSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1).describe('shown on the draft card — say what it does, in the fiction'),
  /**
   * Applied together as one pick. **A list, not a single effect, because a
   * card that only ever gives is not a choice.**
   *
   * The first pool shipped one effect per perk and every one of them was a
   * free upgrade — which reproduced exactly the problem drafting was built to
   * solve, the one the bot harness had already named for towers: preference
   * rather than decision. Pairing a gain with a cost is what turns a pick-1-of-3
   * into a decision, and it needs nothing more than this being an array.
   */
  effects: z.array(MetaEffectSchema).min(1),
  /**
   * How many times this perk may be taken in one run. Each stack applies one
   * more rank of the effect.
   */
  maxStacks: z.number().int().positive().default(1),
  /**
   * Relative likelihood of appearing in an offer. Not a rarity tier — a plain
   * weight, so tuning drop rates is one number and needs no new concept.
   */
  weight: z.number().positive().default(1),
});
export type Perk = z.infer<typeof PerkSchema>;

/** perks.json */
export const PerksFileSchema = z
  .object({
    /** How many cards a draft offers. Fewer than this only when the pool runs dry. */
    offerSize: z.number().int().min(2).max(5).default(3),
    /**
     * RETIRED at MG5.5 (TRIANGLE.md §B.4) — kept only so existing files still
     * validate. **Nothing reads it.** Drafts come from hero levels now, so the
     * cadence dial is `economy.xp`, not this.
     *
     * A card per wave clear rewarded *surviving* and fired about twelve times a
     * run. A card per level rewards *fighting* and fires 25-35 times, which is
     * the cadence the whole progression loop was missing.
     */
    everyNWaves: z.number().int().min(1).max(5).default(1),
    perks: z.array(PerkSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.perks.forEach((p, i) => {
      if (seen.has(p.id)) {
        ctx.addIssue({ code: 'custom', path: ['perks', i, 'id'], message: `duplicate perk id "${p.id}"` });
      }
      seen.add(p.id);

      p.effects.forEach((fx, j) => {
        if (fx.type === 'kingdom-stat' || fx.type === 'hero-stat' || fx.type === 'tower-stat') {
          const why = NOT_MID_RUN[fx.stat];
          if (why) {
            ctx.addIssue({
              code: 'custom',
              path: ['perks', i, 'effects', j, 'stat'],
              message: `"${fx.stat}" cannot be a perk: ${why}`,
            });
          }
        }
        if (fx.type === 'unlock-tower') {
          ctx.addIssue({
            code: 'custom',
            path: ['perks', i, 'effects', j, 'type'],
            message: 'unlock-tower is reserved and unimplemented; all towers ship unlocked',
          });
        }
      });
    });

    // A draft that cannot fill its own offer on the first wave is a
    // configuration error, not a runtime edge case.
    if (file.perks.length < file.offerSize) {
      ctx.addIssue({
        code: 'custom',
        path: ['perks'],
        message: `pool of ${file.perks.length} cannot fill an offer of ${file.offerSize}`,
      });
    }
  });
export type PerksFile = z.infer<typeof PerksFileSchema>;
