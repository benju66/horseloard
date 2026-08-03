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
 * Which half of the game a path belongs to. **Not a budget** — points are one
 * pool spent anywhere.
 *
 * It survives the retirement of the two-budget experiment because it is still
 * true and still useful: it groups the tabs, and it is what the balance probes
 * slice by. What it no longer does is stop you spending.
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
  /**
   * The glyph on the node's tile. One or two emoji.
   *
   * Emoji rather than sprites so the whole tree is legible before a single icon
   * is commissioned — the tree has to be *readable at a glance* to be a tree at
   * all, and a grid of identical squares is a list wearing a costume.
   */
  icon: z.string().min(1).max(8),
  cost: z.number().int().positive().describe('per rank'),
  /**
   * How many times this node may be bought. 1 = a one-off.
   *
   * Ranks let a build go *deep* where the budget otherwise forces it wide — 48
   * points across 72 nodes is ~24 nodes, all shallow. They are also what
   * guarantees there is always something worth spending a level-up on.
   *
   * **Rules are always rank 1**, enforced below: a rule that applied "1.4 times"
   * would not be a rule, and the distinction between a rule and a stat is the
   * thing that stops the tree collapsing back into a spreadsheet.
   */
  maxRank: z.number().int().positive().default(1),
  /**
   * Row in its column, 0 at the top. The tree renders as five vertical
   * columns, one per phone screen, so a path reads top-to-bottom as a single
   * line of commitment — no pan-and-zoom graph on a phone.
   */
  row: z.number().int().nonnegative(),
  /**
   * Points already spent *in this path* before the node opens.
   *
   * Tier gating, and it replaced per-node prerequisite chains for a reason: a
   * chain forces one specific order, which makes every node above the one you
   * want a toll rather than a choice. Gating on a total keeps the commitment —
   * you still have to walk the path — and gives back the freedom to walk it
   * your own way.
   */
  unlockAt: z.number().int().nonnegative().default(0),
  /**
   * Node ids that must be held first. Kept only for genuine dependencies — a
   * node that sharpens an ability needs the node that unlocks it. Everything
   * that used to be a chain is `unlockAt` now.
   */
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
     * **One point per level, every level, spendable anywhere.**
     *
     * This replaced a two-budget version that fenced hero nodes off from
     * kingdom nodes. The fence bought one thing — you could never starve your
     * towers to feed your bow — and cost three: it made three level-ups in
     * every four hand out nothing, it took away the freedom to build what you
     * want, and it quietly propped up the weak paths by forcing you to spend
     * in their half. Free respec covers the case the fence was built for: a
     * starved build is a lesson, never a trap.
     *
     * Scarcity is unaffected and remains the whole mechanism — a tree you can
     * finish is a checklist, so the reachable budget must sit far below the
     * tree's total cost. Enforced below.
     */
    pointsPerLevel: z.number().int().positive().default(1),
    maxLevel: z.number().int().positive(),
    /** Bonus points for campaign milestones — one per map three-starred. */
    pointsPerThreeStar: z.number().int().nonnegative().default(1),
    /** Display names for the two halves. Grouping only; they share one budget. */
    poolNames: z.record(SkillPoolSchema, z.string().min(1)),
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

    // A rule cannot be ranked — see `maxRank`. Caught here rather than trusted,
    // because "buy the rule twice" is a tempting-looking data edit that would
    // quietly turn the one effect type that is not a number back into one.
    file.nodes.forEach((n, i) => {
      if (n.maxRank > 1 && n.effects.some((e) => e.type === 'rule')) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', i, 'maxRank'],
          message: `"${n.id}" carries a rule and cannot have ranks — a rule applied 1.4 times is not a rule`,
        });
      }
      // A node gated above what its own path can afford is unreachable and
      // would render as permanently locked with no way to find out why.
      const pathTotal = file.nodes
        .filter((m) => m.path === n.path && m.id !== n.id)
        .reduce((s2, m) => s2 + m.cost * m.maxRank, 0);
      if (n.unlockAt > pathTotal) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', i, 'unlockAt'],
          message: `"${n.id}" opens at ${n.unlockAt} points but its path only holds ${pathTotal}`,
        });
      }
    });

    // A path sits in exactly one half. Mixing them inside a column would make
    // the tab grouping meaningless and the probes' slices incoherent.
    for (const path of SkillPathSchema.options) {
      const pools = new Set(file.nodes.filter((n) => n.path === path).map((n) => n.pool));
      if (pools.size > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: `path "${path}" spans ${[...pools].join(' and ')}; a column belongs to one half`,
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

    // Scarcity, enforced. Three-starring every map is the ceiling, so the
    // budget assumes all four.
    const total = file.nodes.reduce((s, n) => s + n.cost * n.maxRank, 0);
    const budget = file.maxLevel * file.pointsPerLevel + 4 * file.pointsPerThreeStar;
    if (budget > total * file.maxAllocatableFraction) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxLevel'],
        message:
          `budget ${budget} is ${((budget / total) * 100).toFixed(0)}% of the tree's ${total} ` +
          `points, over the ${(file.maxAllocatableFraction * 100).toFixed(0)}% ceiling — ` +
          `a tree a player can mostly finish is a checklist, not a build`,
      });
    }

    // A node in a half with no display name would render an untitled tab.
    file.nodes.forEach((n, i) => {
      if (!file.poolNames[n.pool]) {
        ctx.addIssue({ code: 'custom', path: ['nodes', i, 'pool'], message: `unknown half "${n.pool}"` });
      }
    });
  });
export type SkillTreeFile = z.infer<typeof SkillTreeFileSchema>;
