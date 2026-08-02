import { z } from 'zod';
import { IdSchema } from './common';

/**
 * The model manifest (MIGRATION-3D.md Part A.2).
 *
 * Two jobs:
 *
 * 1. **Map logical animation states to per-model clip names.** The renderer asks
 *    for `walk`; the manifest says which clip that is in *this* model, or that it
 *    is `procedural` (driven in code). A model shipping nothing but a walk cycle
 *    is usable day one and upgrades later without a code change.
 *
 * 2. **Express the roster as variants of a few base models.** Composition, scale
 *    and palette tint stretch ~6 CC0 models across the whole roster — a Runner is
 *    a Grunt at 0.9x, a Warlord is the large base at 1.8x with crown and cape.
 *    Never source a unique model when a variant works.
 *
 * `file` is optional on purpose: a model with no glTF renders as clearly-temporary
 * placeholder geometry. The whole roster is therefore buildable and playable
 * before a single asset is sourced, and each real model swaps in as a data edit.
 */

/** What the renderer can ask for. Engine state maps onto these; clip names never leak. */
export const AnimationStateSchema = z.enum([
  'idle',
  'walk',
  'attack',
  'death',
  'siege',
  'stagger',
]);
export type AnimationState = z.infer<typeof AnimationStateSchema>;

/** A glTF clip name, or code-driven motion (bob, lean, shove, hop). */
export const ClipRefSchema = z.union([z.literal('procedural'), z.string().min(1)]);

/**
 * Logical state → clip. Every entry optional: a model that ships only a walk
 * cycle is usable day one, and the renderer falls back to `procedural` for
 * anything unmapped. Spelled out rather than `z.record(enum, …)` because that
 * form demands every key be present.
 */
export const ClipMapSchema = z
  .object({
    idle: ClipRefSchema.optional(),
    walk: ClipRefSchema.optional(),
    attack: ClipRefSchema.optional(),
    death: ClipRefSchema.optional(),
    siege: ClipRefSchema.optional(),
    stagger: ClipRefSchema.optional(),
  })
  .prefault({});
export type ClipMap = z.infer<typeof ClipMapSchema>;

/** Where a prop attaches on the host model. */
export const SocketSchema = z.enum(['head', 'hand', 'back', 'mount', 'root']);

/**
 * An extra mesh parented to a socket — the mechanism that turns one base model
 * into several units (shield, sack, crown, cape, bow).
 */
export const ModelPropSchema = z.object({
  id: IdSchema,
  socket: SocketSchema,
  /** Own glTF, or a placeholder primitive when absent. */
  file: z.string().min(1).optional(),
  shape: z
    .enum(['box', 'cone', 'cylinder', 'sphere'])
    .default('box')
    .describe('placeholder geometry used until `file` is supplied'),
  scale: z.number().positive().default(1),
  tint: z.number().int().min(0).optional().describe('palette slot'),
});
export type ModelProp = z.infer<typeof ModelPropSchema>;

export const ModelDefSchema = z.object({
  id: IdSchema,
  /** Inherit file, clips, props and tint from another entry; then override. */
  base: IdSchema.optional(),
  /** Path under /public/models. Absent → placeholder geometry. */
  file: z.string().min(1).optional(),
  /** Applied after height normalisation, so variants are expressed in ratios. */
  scale: z.number().positive().default(1),
  /** Palette slot (see src/render/palette.ts) — recolour, don't re-texture. */
  tint: z.number().int().min(0).optional(),
  clips: ClipMapSchema,
  props: z.array(ModelPropSchema).prefault([]),
  /**
   * Rigid instanced path — deliberately NOT skinned or animated. Swarms use it
   * so a wall of small bodies costs one draw call instead of hundreds.
   */
  instanced: z.boolean().default(false),
  /** Placeholder silhouette hint until a real model lands. */
  silhouette: z
    .enum(['humanoid', 'beast', 'mounted', 'structure', 'blob', 'flyer'])
    .default('humanoid'),
});
export type ModelDef = z.infer<typeof ModelDefSchema>;

export const ModelsFileSchema = z
  .object({ models: z.array(ModelDefSchema).min(1) })
  .superRefine((file, ctx) => {
    const byId = new Map<string, ModelDef>();
    file.models.forEach((m, i) => {
      if (byId.has(m.id)) {
        ctx.addIssue({ code: 'custom', path: ['models', i, 'id'], message: `duplicate model id "${m.id}"` });
      }
      byId.set(m.id, m);
    });

    // Base chains must resolve and must not cycle — a cycle would hang the
    // resolver at render time, which is a miserable place to discover it.
    file.models.forEach((m, i) => {
      const seen = new Set<string>([m.id]);
      let cur = m.base;
      while (cur !== undefined) {
        if (!byId.has(cur)) {
          ctx.addIssue({
            code: 'custom',
            path: ['models', i, 'base'],
            message: `unknown base model "${cur}" (known: ${[...byId.keys()].join(', ')})`,
          });
          return;
        }
        if (seen.has(cur)) {
          ctx.addIssue({
            code: 'custom',
            path: ['models', i, 'base'],
            message: `base chain cycles through "${cur}"`,
          });
          return;
        }
        seen.add(cur);
        cur = byId.get(cur)!.base;
      }
    });
  });
export type ModelsFile = z.infer<typeof ModelsFileSchema>;

/** Flatten a variant against its base chain. Later (more derived) wins. */
export function resolveModel(models: readonly ModelDef[], id: string): ModelDef | undefined {
  const byId = new Map(models.map((m) => [m.id, m]));
  const chain: ModelDef[] = [];
  let cur = byId.get(id);
  while (cur) {
    chain.unshift(cur);
    cur = cur.base ? byId.get(cur.base) : undefined;
  }
  if (chain.length === 0) return undefined;

  const out: ModelDef = { ...chain[0]!, id, base: undefined };
  for (const link of chain.slice(1)) {
    out.file = link.file ?? out.file;
    out.tint = link.tint ?? out.tint;
    out.silhouette = link.silhouette;
    out.instanced = link.instanced || out.instanced;
    // Scale composes down the chain: a 1.4x brute of a 1.0x base is 1.4x.
    out.scale = out.scale * link.scale;
    out.clips = { ...out.clips, ...link.clips };
    out.props = [...out.props, ...link.props];
  }
  return out;
}
