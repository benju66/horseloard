import { z } from 'zod';
import { IdSchema } from './common';
import { MapLightingSchema } from './map';
import { TerrainRuleSchema } from './terrain';

/**
 * A biome is four things, and all four are required (BIOMES.md Part B): a
 * palette, an enemy pool, one terrain rule (Green's absence is the deliberate
 * control), and a difficulty band. A biome missing the terrain rule is a
 * reskin — that is the test, and Green is the only one allowed to fail it.
 */
export const BiomeSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  order: z.number().int().positive().describe('campaign position; biomes unlock in order'),
  /**
   * The species this biome draws from — the design pool. Every wave entry on
   * every map in the biome must name an enemy from here (or from legacyPool,
   * below), enforced at load. A wave summoning an enemy outside its own biome
   * is a boot failure, or the pools are decoration (BIOMES.md Part F).
   */
  pool: z.array(IdSchema).min(1),
  /**
   * TRANSITIONAL — species the absorbed pre-biome maps still use that are not
   * part of the biome's design pool. Named separately so the design intent and
   * the debt stay distinguishable in data: this list must go to zero when the
   * M8.5 wave re-authoring lands, and anything still in it then is a wave that
   * was never re-authored.
   */
  legacyPool: z.array(IdSchema).default([]),
  /** Absent = no rule. Only the first biome may omit it — it is the control. */
  terrainRule: TerrainRuleSchema.optional(),
  /**
   * Win-rate target for the biome at the first-clear reference, informational
   * mirror of the harness's DIFFICULTY_TARGETS. Per-biome rather than per-map
   * because a biome's levels share a character (BIOMES.md Part G.1).
   */
  band: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
  /**
   * The palette — inherited by every map in the biome, per-map override kept.
   * The palette is what makes a biome read as a place, and repeating it per
   * map invites drift (BIOMES.md Part F). Raw partial lighting; maps deep-merge
   * their own authored fields over it before parsing.
   */
  lighting: MapLightingSchema.prefault({}),
});
export type BiomeDef = z.infer<typeof BiomeSchema>;

export const BiomesFileSchema = z
  .object({
    biomes: z.array(BiomeSchema).min(1),
  })
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
          message: `duplicate biome order ${b.order}`,
        });
      }
      orders.add(b.order);
    });
  });
export type BiomesFile = z.infer<typeof BiomesFileSchema>;
