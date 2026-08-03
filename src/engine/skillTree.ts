import type { SkillNode, SkillTreeFile } from '../data/schemas';
import { applyEffectInPlace, type ModifiableData } from './effects';

/** Points per pool, keyed by pool id. Pool ids come from the data, never from here. */
export type PoolPoints = Readonly<Record<string, number>>;

export interface SkillTreeState {
  /** Node ids currently held. Order is irrelevant — effects compose. */
  allocated: readonly string[];
  /** Points earned across the whole career, per pool, spent or not. */
  pointsEarned: PoolPoints;
}

export type AllocationRefusal =
  | 'unknown'
  | 'already-taken'
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

  /** Pool ids, in declaration order — what the header renders and probes iterate. */
  get pools(): readonly string[] {
    return Object.keys(this.file.pools);
  }

  poolName(pool: string): string {
    return this.file.pools[pool as keyof typeof this.file.pools]?.name ?? pool;
  }

  /** Total cost of every node in the tree, or of one pool's nodes. */
  totalCost(pool?: string): number {
    return this.file.nodes
      .filter((n) => pool === undefined || n.pool === pool)
      .reduce((s, n) => s + n.cost, 0);
  }

  /** Points a career has at `level`, per pool, plus the three-star bonuses. */
  pointsAt(level: number, threeStarredMaps: number): PoolPoints {
    const capped = Math.min(level, this.file.maxLevel);
    const out: Record<string, number> = {};
    for (const [id, pool] of Object.entries(this.file.pools)) {
      out[id] =
        Math.floor(capped / pool.levelsPerPoint) + threeStarredMaps * pool.pointsPerThreeStar;
    }
    return out;
  }

  /** What is spent, per pool. Pools absent from the allocation report zero. */
  spent(allocated: readonly string[]): PoolPoints {
    const out: Record<string, number> = {};
    for (const id of this.pools) out[id] = 0;
    for (const id of allocated) {
      const node = this.byId.get(id);
      if (node) out[node.pool] = (out[node.pool] ?? 0) + node.cost;
    }
    return out;
  }

  /** Unspent points, per pool — the number the header leads with. */
  free(allocated: readonly string[], earned: PoolPoints): PoolPoints {
    const spent = this.spent(allocated);
    const out: Record<string, number> = {};
    for (const id of this.pools) out[id] = (earned[id] ?? 0) - (spent[id] ?? 0);
    return out;
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
    if (state.allocated.includes(id)) return 'already-taken';
    for (const req of node.requires) {
      if (!state.allocated.includes(req)) return 'missing-prerequisite';
    }
    for (const ex of node.excludes) {
      if (state.allocated.includes(ex)) return 'excluded';
    }
    // Against *this node's* pool only. The whole point of two budgets is that a
    // bow node can never be priced out by what the walls cost.
    const spent = this.spent(state.allocated)[node.pool] ?? 0;
    if (spent + node.cost > (state.pointsEarned[node.pool] ?? 0)) return 'too-expensive';
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
    return state.allocated.filter((n) => !dropped.has(n));
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
  reconcile(allocated: readonly string[], pointsEarned: PoolPoints): readonly string[] {
    const out: string[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of allocated) {
        if (out.includes(id)) continue;
        if (this.canAllocate(id, { allocated: out, pointsEarned })) {
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
  ): ModifiableData & { unlockedAbilityIds: string[]; unlockedTowerIds: string[] } {
    const out: ModifiableData = structuredClone(data);
    const unlockedAbilityIds: string[] = [];
    const unlockedTowerIds: string[] = [];

    for (const id of allocated) {
      const node = this.byId.get(id);
      if (!node) continue;
      for (const fx of node.effects) {
        const r = applyEffectInPlace(out, fx, 1);
        if (r.unlockAbilityId) unlockedAbilityIds.push(r.unlockAbilityId);
        if (r.unlockTowerId) unlockedTowerIds.push(r.unlockTowerId);
      }
    }

    return { ...out, unlockedAbilityIds, unlockedTowerIds };
  }
}
