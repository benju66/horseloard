import type { Economy, Hero, MapDef, MetaEffect, MetaNode, TowersFile } from '../data/schemas';

export interface ModifiableData {
  hero: Hero;
  economy: Economy;
  towers: TowersFile;
  map: MapDef;
}

const apply = (base: number, perRank: number, mode: 'add' | 'multiply', rank: number): number =>
  mode === 'add' ? base + perRank * rank : base * Math.pow(perRank, rank);

/**
 * Apply one stat effect to a balance-data bundle, mutating it in place.
 *
 * Extracted from `applyMetaModifiers` so the in-run perk draft can reuse the
 * exact same vocabulary and arithmetic. Two callers, one meaning: a rank of a
 * meta node and a stack of a perk modify a stat identically, which is the point
 * — a perk that reads "+15% bow damage" must not quietly differ from the tree
 * node that reads the same.
 *
 * **Incremental application is exact, not an approximation.** Applying rank 1
 * repeatedly composes to applying rank N once, for both modes: `add` accumulates
 * `perRank` each time, and `multiply` accumulates `perRank^1` each time, which
 * is `perRank^N`. That is what lets the perk system hand out one stack at a time
 * mid-run while the meta tree applies all ranks at once before the sim exists.
 *
 * Returns the ability id for `unlock-ability`, since that is a decision for the
 * caller rather than a number to mutate.
 */
export function applyEffectInPlace(
  data: ModifiableData,
  fx: MetaEffect,
  rank: number,
): { unlockAbilityId?: string } {
  if (fx.type === 'unlock-ability') {
    return { unlockAbilityId: fx.abilityId };
  }

  if (fx.type === 'hero-stat') {
    const h = data.hero;
    if (fx.stat === 'moveSpeed') h.moveSpeed = apply(h.moveSpeed, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'trampleDamage') h.trample.damage = apply(h.trample.damage, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'staggerResist') {
      // resist shrinks the shove and the control loss
      h.stagger.shoveDistance = h.stagger.shoveDistance / Math.pow(fx.perRank, rank);
      h.stagger.controlLossDuration = h.stagger.controlLossDuration / Math.pow(fx.perRank, rank);
    } else {
      for (const level of h.bow.levels) {
        if (fx.stat === 'bowDamage') level.damage = apply(level.damage, fx.perRank, fx.mode, rank);
        else if (fx.stat === 'bowRange') level.range = apply(level.range, fx.perRank, fx.mode, rank);
        else if (fx.stat === 'bowFireRate') level.fireInterval = level.fireInterval / Math.pow(fx.perRank, rank);
      }
    }
  } else if (fx.type === 'kingdom-stat') {
    const eco = data.economy;
    if (fx.stat === 'startingGold') eco.startingGold = Math.round(apply(eco.startingGold, fx.perRank, fx.mode, rank));
    else if (fx.stat === 'gateMaxHp') data.map.gate.hp = Math.round(apply(data.map.gate.hp, fx.perRank, fx.mode, rank));
    else if (fx.stat === 'repairCost') eco.repair.costPerHp = apply(eco.repair.costPerHp, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'coinMagnetRadius') eco.coins.magnetRadius = apply(eco.coins.magnetRadius, fx.perRank, fx.mode, rank);
    else if (fx.stat === 'coinExpiryTime') eco.coins.expirySeconds = apply(eco.coins.expirySeconds, fx.perRank, fx.mode, rank);
    // wavePreviewDetail: UI concern, not a sim number — handled by scenes when the preview lands
  } else if (fx.type === 'tower-stat') {
    for (const tower of data.towers.towers) {
      if (fx.towerId !== null && tower.id !== fx.towerId) continue;
      const stats = [...tower.levels, ...tower.branches.map((b) => b.stats)];
      for (const st of stats) {
        if (fx.stat === 'damage') st.damage = apply(st.damage, fx.perRank, fx.mode, rank);
        else if (fx.stat === 'range') st.range = apply(st.range, fx.perRank, fx.mode, rank);
        else if (fx.stat === 'fireRate') st.fireInterval = st.fireInterval / Math.pow(fx.perRank, rank);
      }
      if (fx.stat === 'cost') {
        for (const level of tower.levels) level.cost = Math.max(1, Math.round(apply(level.cost, fx.perRank, fx.mode, rank)));
        for (const b of tower.branches) b.cost = Math.max(1, Math.round(apply(b.cost, fx.perRank, fx.mode, rank)));
      }
    }
  }
  // unlock-tower: reserved — all four towers ship unlocked for now
  return {};
}

/**
 * The meta tree as a pure data transform: purchased ranks rewrite copies of
 * the balance data BEFORE the Simulation is built. The engine never knows
 * the meta tree exists — the substrate rule holds.
 */
export function applyMetaModifiers(
  data: ModifiableData,
  nodes: readonly MetaNode[],
  ranks: Record<string, number>,
): ModifiableData & { unlockedAbilityIds: string[] } {
  const out: ModifiableData = structuredClone(data);
  const unlockedAbilityIds: string[] = [];

  for (const node of nodes) {
    const rank = ranks[node.id] ?? 0;
    if (rank <= 0) continue;
    const { unlockAbilityId } = applyEffectInPlace(out, node.effect, rank);
    if (unlockAbilityId) unlockedAbilityIds.push(unlockAbilityId);
  }

  return { ...out, unlockedAbilityIds };
}
