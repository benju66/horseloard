import { z } from 'zod';
import { IdSchema } from './common';
import { MetaEffectSchema } from './effects';

/**
 * The career tree (SKILLTREE.md) — the only place a run's power is decided.
 *
 * Replaces both the in-run draft and the old meta tree. It reuses
 * `MetaEffectSchema` outright rather than inventing a parallel vocabulary, so
 * "+20% bow damage" means one thing in this game and is implemented once
 * (`applyEffectInPlace`). A new node is a JSON entry and nothing else.
 */

/** The five paths. Three are the pillars; two split the hero, because the hero is what you play. */
export const SkillPathSchema = z.enum(['hunt', 'ride', 'wall', 'host', 'crown']);
export type SkillPath = z.infer<typeof SkillPathSchema>;

/**
 * What a node is *for*, which is also how the UI colours it.
 *
 * `synergy` is the important one. Research on skill trees keeps landing on the
 * same two failures: trees full of unnoticeable stat bumps (the Witcher 3
 * problem, where players simply ignored the tree), and trees that are N
 * unrelated silos. A synergy node pays off only if you invested in *another*
 * path — it is the connective tissue that makes five columns feel like one
 * build instead of five lists.
 */
export const SkillKindSchema = z.enum(['minor', 'notable', 'synergy', 'ability', 'keystone']);
export type SkillKind = z.infer<typeof SkillKindSchema>;

export const SkillNodeSchema = z.object({
  id: IdSchema,
  path: SkillPathSchema,
  kind: SkillKindSchema,
  name: z.string().min(1),
  /** Shown on the node. State the effect plainly; a trade-off hidden in small print is a lie. */
  description: z.string().min(1),
  cost: z.number().int().positive(),
  /**
   * Row in its column, 0 at the top. The tree renders as five vertical
   * columns, one per phone screen, so a path reads top-to-bottom as a single
   * line of commitment — no pan-and-zoom graph on a phone.
   */
  row: z.number().int().nonnegative(),
  /** Node ids that must be taken first. Empty = available from the start of the path. */
  requires: z.array(IdSchema).default([]),
  /**
   * Node ids this one locks out, and which lock this one out.
   *
   * Keystones use it: each path ends in a pair, and taking one forecloses the
   * other. That is the Path of Exile shape — a large advantage with a real
   * downside, at the end of a long path, so it commits the build. Declared on
   * both sides; `loader.ts` checks the symmetry, because a one-sided
   * exclusion is a rule that only applies depending on click order.
   */
  excludes: z.array(IdSchema).default([]),
  effects: z.array(MetaEffectSchema).min(1),
});
export type SkillNode = z.infer<typeof SkillNodeSchema>;

/** skilltree.json */
export const SkillTreeFileSchema = z
  .object({
    /**
     * Points per career level, and the level curve. **Scarcity is the whole
     * mechanism**: a tree you can finish is a checklist, so the reachable
     * budget must sit far below the tree's total cost. `loader.ts` enforces
     * that as `maxAllocatableFraction`.
     */
    pointsPerLevel: z.number().int().positive().default(1),
    maxLevel: z.number().int().positive(),
    /** Bonus points for campaign milestones — one per map three-starred. */
    pointsPerThreeStar: z.number().int().nonnegative().default(1),
    /**
     * The hard ceiling on how much of the tree a maxed player may hold.
     * Checked at load against the real node costs, so adding nodes without
     * adding budget is a boot failure rather than a slow drift into "unlock
     * everything eventually".
     */
    maxAllocatableFraction: z.number().gt(0).lt(1).default(0.35),
    nodes: z.array(SkillNodeSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const byId = new Map(file.nodes.map((n) => [n.id, n]));

    file.nodes.forEach((n, i) => {
      if (file.nodes.findIndex((m) => m.id === n.id) !== i) {
        ctx.addIssue({ code: 'custom', path: ['nodes', i, 'id'], message: `duplicate node id "${n.id}"` });
      }

      n.requires.forEach((req, j) => {
        const target = byId.get(req);
        if (!target) {
          ctx.addIssue({ code: 'custom', path: ['nodes', i, 'requires', j], message: `unknown node "${req}"` });
        } else if (target.path !== n.path) {
          // Cross-path prerequisites would make one column unreadable without
          // scrolling to another, and quietly break the "one path per screen"
          // layout the whole tree is shaped around.
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', i, 'requires', j],
            message: `"${req}" is in path "${target.path}"; prerequisites must stay within a path`,
          });
        } else if (target.row >= n.row) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', i, 'requires', j],
            message: `"${req}" is at row ${target.row}, at or below "${n.id}" (row ${n.row}) — a path must read downward`,
          });
        }
      });

      n.excludes.forEach((ex, j) => {
        const target = byId.get(ex);
        if (!target) {
          ctx.addIssue({ code: 'custom', path: ['nodes', i, 'excludes', j], message: `unknown node "${ex}"` });
        } else if (!target.excludes.includes(n.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', i, 'excludes', j],
            message: `"${ex}" does not exclude "${n.id}" back — exclusion must be symmetric or it depends on click order`,
          });
        }
      });
    });

    // Every path needs exactly two keystones, and they must exclude each other.
    // A path with one keystone has no choice at its end; a path with three has
    // a comparison nobody can hold in their head.
    for (const path of ['hunt', 'ride', 'wall', 'host', 'crown'] as const) {
      const keys = file.nodes.filter((n) => n.path === path && n.kind === 'keystone');
      if (keys.length !== 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: `path "${path}" has ${keys.length} keystones; every path ends in a choice of exactly two`,
        });
      } else if (!keys[0]!.excludes.includes(keys[1]!.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: `the two "${path}" keystones must exclude each other`,
        });
      }
    }

    // Scarcity, enforced. See `maxAllocatableFraction`.
    const total = file.nodes.reduce((s, n) => s + n.cost, 0);
    const budget = file.maxLevel * file.pointsPerLevel + 4 * file.pointsPerThreeStar;
    if (budget > total * file.maxAllocatableFraction) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxLevel'],
        message:
          `budget ${budget} is ${((budget / total) * 100).toFixed(0)}% of the tree's ${total} points, ` +
          `over the ${(file.maxAllocatableFraction * 100).toFixed(0)}% ceiling — ` +
          `a tree a player can mostly finish is a checklist, not a build`,
      });
    }
  });
export type SkillTreeFile = z.infer<typeof SkillTreeFileSchema>;
