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

/**
 * The six paths, in two pools of three.
 *
 * **Hero:** Hunt (shoot), Ride (charge), Storm (shape the ground).
 * **Kingdom:** Wall (towers), Host (soldiers), Crown (gold and the gate).
 *
 * The pools are the load-bearing part. A single points budget meant every bow
 * node was a tower node you did not buy, so a hero-heavy career could arrive at
 * map 4 structurally unable to hold it — and the game's answer was to punish
 * that. Two budgets make the triangle a *guarantee* rather than a lesson: you
 * always have some of both, and the choice inside each half is still real. It
 * is the same move as M5's offer rule, which beat four milestones of tuning by
 * constraining shape instead of numbers.
 */
export const SkillPathSchema = z.enum(['hunt', 'ride', 'storm', 'wall', 'host', 'crown']);
export type SkillPath = z.infer<typeof SkillPathSchema>;

/**
 * Which budget a path spends from. Ids are data, not engine vocabulary — the
 * allocator groups by whatever strings it finds here, so a third pool would be
 * a JSON change (CLAUDE.md #1).
 */
export const SkillPoolSchema = z.enum(['hero', 'kingdom']);
export type SkillPool = z.infer<typeof SkillPoolSchema>;

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
  /** Which budget this costs from. Every node in a path must agree. */
  pool: SkillPoolSchema,
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
     * How each pool earns. **Scarcity is the whole mechanism** — a tree you can
     * finish is a checklist — so every pool's reachable budget must sit far
     * below the cost of the nodes it can buy. Checked per pool below, because a
     * combined check would let a fat pool hide a thin one.
     *
     * `levelsPerPoint` rather than points-per-level: the interesting rates are
     * slower than one per level, and a fraction here would be a rounding bug
     * waiting to be argued about.
     */
    pools: z.record(
      SkillPoolSchema,
      z.object({
        /** Shown in the tree header beside the count. */
        name: z.string().min(1),
        levelsPerPoint: z.number().int().positive().default(1),
        pointsPerThreeStar: z.number().int().nonnegative().default(1),
      }),
    ),
    maxLevel: z.number().int().positive(),
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

    // A path spends from exactly one pool. Mixing them inside a column would
    // make the header's two counters unreadable — you could not tell which
    // number a node was about to spend.
    for (const path of SkillPathSchema.options) {
      const inPath = file.nodes.filter((n) => n.path === path);
      const pools = new Set(inPath.map((n) => n.pool));
      if (pools.size > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: `path "${path}" spans pools ${[...pools].join(' and ')}; a column spends from one budget`,
        });
      }
    }

    // Every path needs exactly two keystones, and they must exclude each other.
    // A path with one keystone has no choice at its end; a path with three has
    // a comparison nobody can hold in their head.
    for (const path of SkillPathSchema.options) {
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

    // Scarcity, enforced **per pool**. A combined check passes happily while one
    // pool is 60% reachable and the other 15%, which is the exact failure the
    // split was made to avoid: a half of the tree nobody has to choose within.
    //
    // Three-starring every map is the ceiling, so the budget assumes all four.
    for (const [poolId, pool] of Object.entries(file.pools)) {
      const nodes = file.nodes.filter((n) => n.pool === poolId);
      if (nodes.length === 0) continue;
      const total = nodes.reduce((s, n) => s + n.cost, 0);
      const budget =
        Math.floor(file.maxLevel / pool.levelsPerPoint) + 4 * pool.pointsPerThreeStar;
      if (budget > total * file.maxAllocatableFraction) {
        ctx.addIssue({
          code: 'custom',
          path: ['pools', poolId],
          message:
            `"${poolId}" budget ${budget} is ${((budget / total) * 100).toFixed(0)}% of its ` +
            `${total} points, over the ${(file.maxAllocatableFraction * 100).toFixed(0)}% ceiling — ` +
            `a pool a player can mostly finish is a checklist, not a build`,
        });
      }
    }

    // A node whose pool has no config would be unbuyable with no way to say why.
    file.nodes.forEach((n, i) => {
      if (!file.pools[n.pool]) {
        ctx.addIssue({ code: 'custom', path: ['nodes', i, 'pool'], message: `unknown pool "${n.pool}"` });
      }
    });
  });
export type SkillTreeFile = z.infer<typeof SkillTreeFileSchema>;
