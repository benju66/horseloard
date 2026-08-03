import type { SkillNode, SkillTreeFile } from '../data/schemas';
import { applyEffectInPlace, type ModifiableData } from './effects';

export interface SkillTreeState {
  /** Node ids currently held. Order is irrelevant — effects compose. */
  allocated: readonly string[];
  /** Points earned across the whole career, spent or not. One budget, spent anywhere. */
  pointsEarned: number;
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

  /** The two halves, in declaration order — tab groups, not budgets. */
  get pools(): readonly string[] {
    return Object.keys(this.file.poolNames);
  }

  poolName(pool: string): string {
    return this.file.poolNames[pool as keyof typeof this.file.poolNames] ?? pool;
  }

  /** Total cost of every node in the tree, or of one half's nodes. */
  totalCost(pool?: string): number {
    return this.file.nodes
      .filter((n) => pool === undefined || n.pool === pool)
      .reduce((s, n) => s + n.cost, 0);
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
    if (state.allocated.includes(id)) return 'already-taken';
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
  reconcile(allocated: readonly string[], pointsEarned: number): readonly string[] {
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
