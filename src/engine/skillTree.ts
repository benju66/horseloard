import type { SkillNode, SkillTreeFile } from '../data/schemas';
import { applyEffectInPlace, type ModifiableData } from './effects';

export interface SkillTreeState {
  /**
   * Node ids held, **one entry per rank**. A node at rank 3 appears three times.
   *
   * A list rather than a rank map so ranks needed no save migration: `build`
   * was already `string[]`, and a v3 save written before ranks existed reads as
   * every node at rank 1, which is exactly what it was.
   */
  allocated: readonly string[];
  /** Points earned across the whole career, spent or not. One budget, spent anywhere. */
  pointsEarned: number;
}

export type AllocationRefusal =
  | 'unknown'
  | 'maxed'
  | 'path-locked'
  | 'missing-prerequisite'
  | 'excluded'
  | 'too-expensive';

/**
 * The career tree (SKILLTREE.md) — the only place a run's power is decided.
 *
 * Pure allocation logic: what may be taken, what it costs, what it forecloses.
 * It never touches balance data itself; `applyTo` folds the held nodes into a
 * clone the same way `applyMetaModifiers` always has, so the engine still never
 * learns that a tree exists.
 *
 * Content-agnostic (CLAUDE.md #1): it knows about points, prerequisites and
 * exclusions. It has never heard of a bow.
 */
export class SkillTree {
  private readonly file: SkillTreeFile;
  private readonly byId: ReadonlyMap<string, SkillNode>;

  constructor(file: SkillTreeFile) {
    this.file = file;
    this.byId = new Map(file.nodes.map((n) => [n.id, n]));
  }

  get nodes(): readonly SkillNode[] {
    return this.file.nodes;
  }

  node(id: string): SkillNode | undefined {
    return this.byId.get(id);
  }

  /** The two halves, in declaration order — tab groups, not budgets. */
  get pools(): readonly string[] {
    return Object.keys(this.file.poolNames);
  }

  poolName(pool: string): string {
    return this.file.poolNames[pool as keyof typeof this.file.poolNames] ?? pool;
  }

  /**
   * Total cost of the tree, or of one half — **every rank of every node**.
   *
   * Ranks are what the budget is actually spent against, so a denominator that
   * counted each node once would have reported the tree as a third reachable
   * when it is a quarter. That is the scarcity rule reading its own gauge wrong,
   * which is worse than not having the gauge.
   */
  totalCost(pool?: string): number {
    return this.file.nodes
      .filter((n) => pool === undefined || n.pool === pool)
      .reduce((s, n) => s + n.cost * n.maxRank, 0);
  }

  /**
   * Points a career has at `level`, plus one per map three-starred.
   *
   * One per level, every level — the cadence matters as much as the total. A
   * schedule that skips levels means most level-ups hand out nothing, which is
   * the worst possible shape for a game whose whole spine is levelling.
   */
  pointsAt(level: number, threeStarredMaps: number): number {
    const capped = Math.min(level, this.file.maxLevel);
    return capped * this.file.pointsPerLevel + threeStarredMaps * this.file.pointsPerThreeStar;
  }

  spent(allocated: readonly string[]): number {
    let n = 0;
    for (const id of allocated) n += this.byId.get(id)?.cost ?? 0;
    return n;
  }

  /** How many ranks of a node are held. */
  rankOf(id: string, allocated: readonly string[]): number {
    let n = 0;
    for (const held of allocated) if (held === id) n++;
    return n;
  }

  /** Points sunk into one path — the currency tier gating is priced in. */
  spentInPath(path: string, allocated: readonly string[]): number {
    let n = 0;
    for (const id of allocated) {
      const node = this.byId.get(id);
      if (node?.path === path) n += node.cost;
    }
    return n;
  }

  /** Unspent points — the number the header leads with. */
  free(allocated: readonly string[], earned: number): number {
    return earned - this.spent(allocated);
  }

  /**
   * Why a node cannot be taken, or null if it can.
   *
   * Returns the reason rather than a boolean so the tree screen can say *which*
   * wall you hit. "Locked" with no explanation is the thing that makes players
   * stop reading a tree.
   */
  refusal(id: string, state: SkillTreeState): AllocationRefusal | null {
    const node = this.byId.get(id);
    if (!node) return 'unknown';
    if (this.rankOf(id, state.allocated) >= node.maxRank) return 'maxed';
    // Tier gating before prerequisites: "walk further down this path" is a
    // clearer instruction than "take some other node", and it is the one a
    // player can act on without hunting for which node is missing.
    if (this.spentInPath(node.path, state.allocated) < node.unlockAt) return 'path-locked';
    for (const req of node.requires) {
      if (!state.allocated.includes(req)) return 'missing-prerequisite';
    }
    for (const ex of node.excludes) {
      if (state.allocated.includes(ex)) return 'excluded';
    }
    if (this.spent(state.allocated) + node.cost > state.pointsEarned) return 'too-expensive';
    return null;
  }

  canAllocate(id: string, state: SkillTreeState): boolean {
    return this.refusal(id, state) === null;
  }

  /** Returns the new allocation, or the old one unchanged when refused. */
  allocate(id: string, state: SkillTreeState): readonly string[] {
    if (!this.canAllocate(id, state)) return state.allocated;
    return [...state.allocated, id];
  }

  /**
   * Drop a node **and everything that depended on it**.
   *
   * Refunding one node in the middle of a path would leave the nodes below it
   * held but unreachable — a state the allocator would never have produced and
   * would never let you rebuild. Cascading keeps every reachable state one the
   * player could have built forward into.
   */
  deallocate(id: string, state: SkillTreeState): readonly string[] {
    if (!state.allocated.includes(id)) return state.allocated;

    // Ranked nodes refund one rank at a time, and only the *last* rank can
    // strand anything below — a node still held at rank 1 keeps paying its
    // prerequisite and its tier points, so nothing cascades.
    if (this.rankOf(id, state.allocated) > 1) {
      const out = [...state.allocated];
      out.splice(out.indexOf(id), 1);
      // ...unless dropping that rank drops the path below a tier a node below
      // it needed. Rebuilding forward is the only way to know.
      return this.reconcile(out, state.pointsEarned);
    }

    const dropped = new Set([id]);
    // Iterate to a fixed point: a node three deep in a path depends on the one
    // above it, which may only have been dropped on the previous pass.
    let changed = true;
    while (changed) {
      changed = false;
      for (const held of state.allocated) {
        if (dropped.has(held)) continue;
        const node = this.byId.get(held);
        if (node && node.requires.some((r) => dropped.has(r))) {
          dropped.add(held);
          changed = true;
        }
      }
    }
    // Reconciled afterwards because losing a node also loses its cost from the
    // path total, which can close a tier behind other nodes still held.
    return this.reconcile(
      state.allocated.filter((n) => !dropped.has(n)),
      state.pointsEarned,
    );
  }

  /** Free, always. A tree nobody dares experiment with forfeits its own point. */
  respec(): readonly string[] {
    return [];
  }

  /**
   * Drop anything no longer legal — after a data change, or a save from a build
   * whose tree had different prerequisites.
   *
   * Rebuilds forward from nothing rather than filtering in place, because
   * "legal" depends on what else is held and a single pass over an illegal set
   * can leave a different illegal set.
   */
  reconcile(allocated: readonly string[], pointsEarned: number): readonly string[] {
    const out: string[] = [];
    const want = new Map<string, number>();
    for (const id of allocated) want.set(id, (want.get(id) ?? 0) + 1);

    let changed = true;
    while (changed) {
      changed = false;
      for (const [id, ranks] of want) {
        // Rank by rank: a node wanted at rank 3 may only be affordable to 2,
        // and half a node is a legal state where half a prerequisite is not.
        while (this.rankOf(id, out) < ranks && this.canAllocate(id, { allocated: out, pointsEarned })) {
          out.push(id);
          changed = true;
        }
      }
    }
    return out;
  }

  /**
   * Fold the held nodes into a clone of the balance data.
   *
   * Same contract `applyMetaModifiers` always had: a pure data transform run
   * *before* the Simulation exists, so the engine never knows the tree is
   * there. Returns the unlocks too, since those are decisions for a system
   * rather than numbers to mutate.
   */
  applyTo(
    data: ModifiableData,
    allocated: readonly string[],
  ): ModifiableData & {
    unlockedAbilityIds: string[];
    unlockedTowerIds: string[];
    rules: string[];
    scaling: Record<string, { perUnit: number; max: number }>;
  } {
    const out: ModifiableData = structuredClone(data);
    const unlockedAbilityIds: string[] = [];
    const unlockedTowerIds: string[] = [];
    const rules: string[] = [];
    // Same key from two nodes sums, so a path can deepen one relationship
    // instead of scattering six shallow ones. The cap takes the loosest of the
    // two — a node that raises the ceiling is doing something worth paying for.
    const scaling: Record<string, { perUnit: number; max: number }> = {};

    // Grouped by id so a ranked node applies its rank once rather than N times.
    // For `add` and `multiply` alike the two compose identically (see
    // `applyEffectInPlace`), but a rule must fire once however many ranks the
    // data claims, and scaling multiplies `perUnit` by the rank.
    const ranks = new Map<string, number>();
    for (const id of allocated) ranks.set(id, (ranks.get(id) ?? 0) + 1);

    for (const [id, rank] of ranks) {
      const node = this.byId.get(id);
      if (!node) continue;
      for (const fx of node.effects) {
        const r = applyEffectInPlace(out, fx, rank);
        if (r.unlockAbilityId) unlockedAbilityIds.push(r.unlockAbilityId);
        if (r.unlockTowerId) unlockedTowerIds.push(r.unlockTowerId);
        if (r.rule) rules.push(r.rule);
        if (r.scale) {
          const cur = scaling[r.scale.key];
          scaling[r.scale.key] = cur
            ? { perUnit: cur.perUnit + r.scale.perUnit, max: Math.max(cur.max, r.scale.max) }
            : { perUnit: r.scale.perUnit, max: r.scale.max };
        }
      }
    }

    return { ...out, unlockedAbilityIds, unlockedTowerIds, rules, scaling };
  }
}
