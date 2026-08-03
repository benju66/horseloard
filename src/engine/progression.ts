import type { Economy, MetaNode } from '../data/schemas';

/** The current save schema version. Bump with every shape or meaning change. */
export const SAVE_VERSION = 2;

/**
 * Save schema v2 — versioned from the first write (CLAUDE.md #4). No derived state.
 *
 * The shape is unchanged from v1; the *meaning* of `meta.ranks` is not. MG5.7
 * retired every stat node in the meta tree in favour of unlocks, so a v1 save
 * holds ranks in nodes that no longer exist. `SaveManager.migrate` refunds
 * those and drops the keys — see the note there for why that is a migration and
 * not something to leave to `applyMetaModifiers` quietly ignoring them.
 */
export interface SaveData {
  schemaVersion: number;
  updatedAt: string;
  tokens: number;
  campaign: Record<string, { stars: 0 | 1 | 2 | 3; bestWavesCleared: number; completed: boolean }>;
  endlessBest: Record<string, number>;
  meta: { ranks: Record<string, number> };
}

export function newSave(): SaveData {
  return {
    schemaVersion: SAVE_VERSION,
    updatedAt: new Date().toISOString(),
    tokens: 0,
    campaign: {},
    endlessBest: {},
    meta: { ranks: {} },
  };
}

/**
 * The nodes MG5.7 retired, with what each rank cost. Frozen here rather than
 * read from `metatree.json`, because the file no longer contains them — a
 * migration has to know the *old* world, and looking it up in the new one is
 * how refunds silently become zero.
 */
const RETIRED_V1_NODES: Record<string, readonly number[]> = {
  'swift-steed': [10, 15, 20],
  bowyer: [10, 15, 25],
  fletchers: [15, 25, 40],
  masonry: [20, 35],
  'war-chest': [10, 20, 30],
  'stone-gate': [15, 25, 40],
  lodestone: [10, 20],
};

/**
 * v1 → v2: the meta tree stopped granting stats (TRIANGLE.md §B.6).
 *
 * Every stat node is gone, so a returning player has tokens sunk into things
 * that no longer exist. `applyMetaModifiers` would ignore the orphan keys
 * harmlessly — which is exactly why this needs to be a migration and not left
 * alone. Ignoring them silently *keeps the player's tokens spent* on nothing:
 * the save would look fine, the tree would look untouched, and the tokens would
 * simply be gone. Refunding is the only honest outcome.
 *
 * Volley and Rally Horn survive with the same ids and cheaper costs. Their
 * ranks are kept rather than refunded — the player still has what they bought,
 * and the price difference is not worth clawing back.
 */
export function migrateV1ToV2(save: SaveData): SaveData {
  const next: SaveData = structuredClone(save);
  next.schemaVersion = 2;

  let refund = 0;
  for (const [nodeId, costs] of Object.entries(RETIRED_V1_NODES)) {
    const rank = next.meta.ranks[nodeId] ?? 0;
    for (let r = 0; r < rank; r++) refund += costs[r] ?? 0;
    delete next.meta.ranks[nodeId];
  }
  next.tokens += refund;
  return next;
}

export interface RunOutcome {
  mapId: string;
  victory: boolean;
  wavesCleared: number;
  stars: 1 | 2 | 3;
  endless: boolean;
}

/**
 * Applies a finished run to the save. Token rules (DESIGN §7): stars pay on
 * first-time improvement only; defeat pays per wave cleared (a failed run is
 * progress); endless pays per milestone newly reached. Pure — returns the
 * new save and what was earned.
 */
export function settleRun(save: SaveData, outcome: RunOutcome, economy: Economy): { save: SaveData; tokensEarned: number } {
  const next: SaveData = structuredClone(save);
  const t = economy.tokens;
  let earned = 0;

  if (outcome.endless) {
    const best = next.endlessBest[outcome.mapId] ?? 0;
    const oldMilestones = Math.floor(best / t.endlessMilestoneEvery);
    const newMilestones = Math.floor(outcome.wavesCleared / t.endlessMilestoneEvery);
    if (newMilestones > oldMilestones) earned += (newMilestones - oldMilestones) * t.perEndlessMilestone;
    next.endlessBest[outcome.mapId] = Math.max(best, outcome.wavesCleared);
  } else {
    const entry = next.campaign[outcome.mapId] ?? { stars: 0 as const, bestWavesCleared: 0, completed: false };
    if (outcome.victory) {
      const newStars = Math.max(entry.stars, outcome.stars) as 0 | 1 | 2 | 3;
      earned += Math.max(0, newStars - entry.stars) * t.perStarFirstTime;
      entry.stars = newStars;
      entry.completed = true;
    } else {
      earned += outcome.wavesCleared * t.perWaveOnDefeat;
    }
    entry.bestWavesCleared = Math.max(entry.bestWavesCleared, outcome.wavesCleared);
    next.campaign[outcome.mapId] = entry;
  }

  next.tokens += earned;
  next.updatedAt = new Date().toISOString();
  return { save: next, tokensEarned: earned };
}

/** Linear unlocks: a map is playable if it's first in order or its predecessor is completed. */
export function unlockedMapIds(save: SaveData, mapsInOrder: ReadonlyArray<{ id: string }>): Set<string> {
  const unlocked = new Set<string>();
  for (let i = 0; i < mapsInOrder.length; i++) {
    const map = mapsInOrder[i]!;
    if (i === 0 || save.campaign[mapsInOrder[i - 1]!.id]?.completed) unlocked.add(map.id);
  }
  return unlocked;
}

/** Total tokens sunk into the tree at current ranks (respec refunds exactly this). */
export function spentTokens(nodes: readonly MetaNode[], ranks: Record<string, number>): number {
  let spent = 0;
  for (const node of nodes) {
    const rank = ranks[node.id] ?? 0;
    for (let r = 0; r < rank; r++) spent += node.costPerRank[r] ?? 0;
  }
  return spent;
}

/** Can the next rank of this node be bought? (tokens, max rank, prerequisites at max) */
export function canBuyRank(
  node: MetaNode,
  nodes: readonly MetaNode[],
  ranks: Record<string, number>,
  tokens: number,
): { ok: boolean; cost: number | null; reason?: string } {
  const rank = ranks[node.id] ?? 0;
  const cost = node.costPerRank[rank] ?? null;
  if (cost === null) return { ok: false, cost: null, reason: 'maxed' };
  for (const req of node.requires) {
    const reqNode = nodes.find((n) => n.id === req);
    if (reqNode && (ranks[req] ?? 0) < reqNode.costPerRank.length) {
      return { ok: false, cost, reason: `requires ${reqNode.name}` };
    }
  }
  if (tokens < cost) return { ok: false, cost, reason: 'tokens' };
  return { ok: true, cost };
}
