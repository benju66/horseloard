import { z } from 'zod';
import { IdSchema } from './common';
import { MapLightingSchema } from './map';

/**
 * A biome: a place with its own light, its own enemies and its own rule.
 *
 * Four things, and all four are load-bearing (BIOMES.md Part B) — **a biome
 * missing its terrain rule is a reskin**, and the whole point of the structure
 * is that different biomes make different builds correct. That claim was tested
 * before any of this was built: on the original roster it failed, and it passes
 * only with the counter-enemies M9 added (Part L).
 *
 * The `pool` is the enforced part. A wave summoning an enemy outside its own
 * biome's pool is a boot failure rather than a warning, because a pool that
 * data can quietly ignore is decoration.
 */

/**
 * Rules that change how a whole biome plays, not one run.
 *
 * The same shape as `RuleKeySchema` — a closed enum the sim reads — but named
 * per *place* rather than per build. Not stackable and not parameterised per
 * level: a biome has exactly one and every level in it plays under the same
 * one, which is what makes it a place rather than a modifier.
 */
export const TerrainRuleSchema = z.enum([
  /** Close walls and short sightlines. Tower range ×0.82. */
  'narrow-cuts',
  /** Long views both ways. Enemy speed ×1.12, tower range ×1.10. */
  'open-country',
]);
export type TerrainRule = z.infer<typeof TerrainRuleSchema>;

export const BiomeSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  order: z.number().int().positive().describe('campaign sequence, 1 first'),
  /**
   * The palette, inherited by every map in the biome.
   *
   * Lives here rather than on each map because the light is what makes a biome
   * read as a *place*, and repeating it across four maps invites the drift
   * where level 3 is subtly a different time of day. Maps may still override.
   */
  lighting: MapLightingSchema,
  /**
   * The enemies this biome may draw from. Enforced at load.
   *
   * This is the biome's identity in the only sense that survives measurement:
   * BIOMES.md Part L shows the carrying build changing when the pool changes,
   * and nothing else about a biome moved that number.
   */
  pool: z.array(IdSchema).min(1),
  /**
   * Optional only for the first biome, which is deliberately the control — the
   * place a player learns what normal is. A rule there would teach the
   * exception before the rule (Part C.1). Enforced below.
   */
  terrainRule: TerrainRuleSchema.optional(),
});
export type Biome = z.infer<typeof BiomeSchema>;

/** biomes.json */
export const BiomesFileSchema = z
  .object({ biomes: z.array(BiomeSchema).min(1) })
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    const orders = new Set<number>();
    file.biomes.forEach((b, i) => {
      if (ids.has(b.id)) {
        ctx.addIssue({ code: 'custom', path: ['biomes', i, 'id'], message: `duplicate biome id "${b.id}"` });
      }
      ids.add(b.id);
      if (orders.has(b.order)) {
        ctx.addIssue({
          code: 'custom',
          path: ['biomes', i, 'order'],
          message: `two biomes claim campaign position ${b.order}`,
        });
      }
      orders.add(b.order);
      // Every biome after the first needs a rule, or it is a palette — the
      // failure BIOMES.md Part A.1 exists to prevent, and the one the pool
      // probe caught before any of this was authored.
      if (b.order > 1 && !b.terrainRule) {
        ctx.addIssue({
          code: 'custom',
          path: ['biomes', i, 'terrainRule'],
          message: `"${b.id}" has no terrain rule; only the first biome may be the control`,
        });
      }
    });
  });
export type BiomesFile = z.infer<typeof BiomesFileSchema>;
