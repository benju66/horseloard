import type { Economy } from '../data/schemas';

/** The current save schema version. Bump with every shape or meaning change. */
export const SAVE_VERSION = 3;

/**
 * Save schema v3 — versioned from the first write (CLAUDE.md #4). No derived state.
 *
 * v3 is the career-tree save (SKILLTREE.md). Two fields died with the meta
 * tree: `tokens` and `meta.ranks`. What replaces them is deliberately smaller —
 * **career XP and a list of node ids** — because everything else about a career
 * is derivable from those two plus the campaign record. Level, points earned,
 * points spent and points free are all computed on read, so no two fields in
 * this file can ever disagree with each other.
 */
export interface SaveData {
  schemaVersion: number;
  updatedAt: string;
  /** Total career XP ever earned. Never spent — points come from the level it implies. */
  careerXp: number;
  campaign: Record<string, { stars: 0 | 1 | 2 | 3; bestWavesCleared: number; completed: boolean }>;
  endlessBest: Record<string, number>;
  /** Skill-tree node ids held. The build, and the only thing points buy. */
  build: string[];
  /** Ability ids equipped, in bar order. Capped by the campaign, not the tree. */
  loadout: string[];
}

export function newSave(): SaveData {
  return {
    schemaVersion: SAVE_VERSION,
    updatedAt: new Date().toISOString(),
    careerXp: 0,
    campaign: {},
    endlessBest: {},
    build: [],
    loadout: [],
  };
}

/**
 * Career level from total XP. Level n costs `base × growth^(n-2)`, so the
 * threshold for level L is the geometric sum below it.
 *
 * Iterative rather than closed-form on purpose: the closed form is one
 * `Math.log` away from an off-by-one at every exact threshold, and this runs
 * once per screen open, not once per frame.
 */
export function careerLevel(careerXp: number, economy: Economy, maxLevel: number): number {
  const { base, growth } = economy.career.level;
  let level = 1;
  let need = base;
  let spent = 0;
  while (level < maxLevel && careerXp >= spent + need) {
    spent += need;
    need *= growth;
    level++;
  }
  return level;
}

/** XP into the current level, and what the next one costs. For the bar. */
export function careerProgress(
  careerXp: number,
  economy: Economy,
  maxLevel: number,
): { level: number; into: number; needed: number } {
  const { base, growth } = economy.career.level;
  let level = 1;
  let need = base;
  let spent = 0;
  while (level < maxLevel && careerXp >= spent + need) {
    spent += need;
    need *= growth;
    level++;
  }
  if (level >= maxLevel) return { level: maxLevel, into: 0, needed: 0 };
  return { level, into: careerXp - spent, needed: need };
}

/**
 * Ability slots the campaign has earned: the base, plus one per milestone
 * cleared (abilities.json `equipSlotGrants`).
 *
 * A campaign reward rather than a tree node, deliberately (SKILLTREE.md B): it
 * cannot be rushed by grinding XP, and it cannot be double-dipped by a build.
 * The equip cap is the structural bound on hero damage-per-minute, so the one
 * thing it must not be is purchasable.
 */
export function equipSlots(save: SaveData, base: number, grants: readonly number[]): number {
  const cleared = Object.values(save.campaign).filter((c) => c.completed).length;
  return base + grants.filter((n) => cleared >= n).length;
}

/** Maps three-starred — the campaign half of the points budget. */
export function threeStarredMaps(save: SaveData): number {
  return Object.values(save.campaign).filter((c) => c.stars === 3).length;
}

/**
 * The v1 nodes MG5.7 retired, with what each rank cost. Frozen here rather than
 * read from `metatree.json`, because that file no longer exists at all — a
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

/** Every v2 meta node and its rank costs — the other half of what a v2 save may hold. */
const V2_NODE_COSTS: Record<string, readonly number[]> = {
  'learn-volley': [8],
  'learn-rally-horn': [12],
  'learn-rapid-fire': [16],
  'learn-heavy-shaft': [16],
  'learn-caltrops': [14],
  'veteran-drills': [12],
  'raise-barracks': [20],
  'levy-writ': [14],
  'the-muster': [18],
  'master-fletchers': [16],
  'beacon-lore': [16],
  'the-tithe': [12],
  'hoarders-bargain': [14],
  'standing-stones': [18],
};

/** Shape of a pre-v3 save, for the migration to read without `any`. */
interface LegacySave {
  schemaVersion: number;
  updatedAt: string;
  tokens?: number;
  campaign: SaveData['campaign'];
  endlessBest: SaveData['endlessBest'];
  meta?: { ranks: Record<string, number> };
}

/**
 * v1 → v2: the meta tree stopped granting stats (TRIANGLE.md §B.6). Every stat
 * node was gone, so a returning player had tokens sunk into things that no
 * longer existed; the ranks are dropped and the tokens refunded.
 *
 * Kept as a separate step rather than folded into v2 → v3 so the chain stays a
 * chain. A v1 save runs both; a v2 save runs only the second. Collapsing them
 * would mean the v1 path could only ever be tested through the v3 path.
 */
export function migrateV1ToV2(save: LegacySave): LegacySave {
  const next: LegacySave = structuredClone(save);
  next.schemaVersion = 2;

  let refund = 0;
  for (const [nodeId, costs] of Object.entries(RETIRED_V1_NODES)) {
    const rank = next.meta?.ranks[nodeId] ?? 0;
    for (let r = 0; r < rank; r++) refund += costs[r] ?? 0;
    if (next.meta) delete next.meta.ranks[nodeId];
  }
  next.tokens = (next.tokens ?? 0) + refund;
  return next;
}

/**
 * v2 → v3: one currency (SKILLTREE.md A.2). Tokens and the meta tree are gone;
 * career XP and the skill tree replace both.
 *
 * The conversion has to answer one question honestly: what is a token worth in
 * XP? There is no exchange rate in the design, because the two currencies never
 * coexisted by intent — so inventing one would be inventing progress. What the
 * save *does* hold that survives verbatim is the campaign record, and the new
 * economy already says what a star pays. So career XP is **recomputed from the
 * stars the player actually earned**, and their token balance — banked plus
 * sunk into meta nodes — is added on top at 1:1 so nothing they held is taken
 * away.
 *
 * That is generous by construction and deliberately so. The alternative is a
 * returning player opening a fresh-looking tree, and "your progress is gone but
 * the numbers reconcile" is the worst outcome a migration can produce.
 *
 * The build starts empty: v2 held no tree, and a migration cannot guess which
 * of five paths a player would have walked. The points are all there to spend.
 */
export function migrateV2ToV3(save: LegacySave, economy: Economy): SaveData {
  const legacy = structuredClone(save);

  let sunk = 0;
  for (const [nodeId, costs] of Object.entries(V2_NODE_COSTS)) {
    const rank = legacy.meta?.ranks[nodeId] ?? 0;
    for (let r = 0; r < rank; r++) sunk += costs[r] ?? 0;
  }

  let starXp = 0;
  for (const entry of Object.values(legacy.campaign ?? {})) {
    starXp += entry.stars * economy.career.perStarFirstTime;
  }

  return {
    schemaVersion: 3,
    updatedAt: legacy.updatedAt,
    careerXp: starXp + (legacy.tokens ?? 0) + sunk,
    campaign: legacy.campaign ?? {},
    endlessBest: legacy.endlessBest ?? {},
    build: [],
    loadout: [],
  };
}

export interface RunOutcome {
  mapId: string;
  victory: boolean;
  wavesCleared: number;
  stars: 1 | 2 | 3;
  endless: boolean;
}

/**
 * Applies a finished run to the save. Payout rules (DESIGN §7, now in XP):
 * stars pay on first-time improvement only; defeat pays per wave cleared (a
 * failed run is progress); endless pays per milestone newly reached. Pure —
 * returns the new save and what was earned.
 *
 * `runXp` is what the run itself banked from kills. It is passed in rather than
 * recomputed because the Simulation already counted it, and two counts of the
 * same thing is one count too many.
 */
export function settleRun(
  save: SaveData,
  outcome: RunOutcome,
  economy: Economy,
  runXp = 0,
): { save: SaveData; xpEarned: number } {
  const next: SaveData = structuredClone(save);
  const t = economy.career;
  let earned = Math.round(runXp);

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

  next.careerXp += earned;
  next.updatedAt = new Date().toISOString();
  return { save: next, xpEarned: earned };
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
