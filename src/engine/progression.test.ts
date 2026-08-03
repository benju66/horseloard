import { describe, expect, it } from 'vitest';
import {
  SAVE_VERSION,
  careerLevel,
  careerProgress,
  migrateV1ToV2,
  migrateV2ToV3,
  newSave,
  settleRun,
  threeStarredMaps,
  type SaveData,
} from './progression';
import { TEST_ECONOMY } from './testFixtures';

/**
 * The first real save migration (CLAUDE.md #5 promised one from day one; MG5.7
 * is where it was finally owed).
 *
 * A migration is the one piece of code that runs against data written by a
 * build that no longer exists, so the failure mode is silent and permanent: a
 * player opens the game, their tokens are gone, and there is nothing to
 * reproduce. These tests are the only place that world still exists.
 */

/** A v1 save as the retired build would actually have written it. */
function v1Save(ranks: Record<string, number>, tokens = 0) {
  return {
    schemaVersion: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    tokens,
    campaign: { 'meadow-road': { stars: 3 as const, bestWavesCleared: 8, completed: true } },
    endlessBest: { 'meadow-road': 22 },
    meta: { ranks },
  };
}

/** A v2 save: the shape after the first migration, before the tree existed. */
function v2Save(ranks: Record<string, number>, tokens = 0) {
  return { ...v1Save(ranks, tokens), schemaVersion: 2 };
}

describe('v1 → v2: the meta tree stopped granting stats', () => {
  it('refunds every token sunk into a retired node', () => {
    // swift-steed rank 2 = 10 + 15; war-chest rank 3 = 10 + 20 + 30.
    const out = migrateV1ToV2(v1Save({ 'swift-steed': 2, 'war-chest': 3 }, 5));
    expect(out.tokens).toBe(5 + 25 + 60);
  });

  it('refunds partial ranks, not the full cost of the node', () => {
    // A player who bought one of three ranks gets one rank back.
    expect(migrateV1ToV2(v1Save({ bowyer: 1 })).tokens).toBe(10);
    expect(migrateV1ToV2(v1Save({ bowyer: 3 })).tokens).toBe(50);
  });

  it('drops the retired keys so nothing can read them again', () => {
    const out = migrateV1ToV2(v1Save({ 'swift-steed': 2, fletchers: 1 }));
    expect(out.meta!.ranks).toEqual({});
  });

  it('keeps the nodes that survived, at their ranks', () => {
    // Volley and Rally Horn kept their ids. The player still has what they
    // bought; the price change is not worth clawing back.
    const out = migrateV1ToV2(v1Save({ 'learn-volley': 1, 'swift-steed': 1 }));
    expect(out.meta!.ranks).toEqual({ 'learn-volley': 1 });
    expect(out.tokens).toBe(10); // swift-steed rank 1 only
  });

  it('leaves campaign progress and endless bests untouched', () => {
    const before = v1Save({ 'stone-gate': 1 });
    const out = migrateV1ToV2(before);
    expect(out.campaign).toEqual(before.campaign);
    expect(out.endlessBest).toEqual(before.endlessBest);
  });

  it('does not mutate the save it was handed', () => {
    const before = v1Save({ 'swift-steed': 2 }, 3);
    migrateV1ToV2(before);
    // A migration that edits in place makes a failed load unrecoverable.
    expect(before.meta!.ranks).toEqual({ 'swift-steed': 2 });
    expect(before.tokens).toBe(3);
    expect(before.schemaVersion).toBe(1);
  });

  it('stamps the new version', () => {
    expect(migrateV1ToV2(v1Save({})).schemaVersion).toBe(2);
  });

  it('is a no-op for a save that spent nothing', () => {
    const out = migrateV1ToV2(v1Save({}, 12));
    expect(out.tokens).toBe(12);
    expect(out.meta!.ranks).toEqual({});
  });
});

describe('v2 → v3: one currency, and a tree instead of a meta tree', () => {
  const eco = TEST_ECONOMY;
  const star = eco.career.perStarFirstTime;

  it('recomputes career XP from the stars the player actually earned', () => {
    // The fixture save holds one map at 3 stars.
    const out = migrateV2ToV3(v2Save({}), eco);
    expect(out.careerXp).toBe(3 * star);
  });

  it('adds banked tokens on top, so nothing held is taken away', () => {
    const out = migrateV2ToV3(v2Save({}, 37), eco);
    expect(out.careerXp).toBe(3 * star + 37);
  });

  it('refunds tokens sunk into meta nodes as well as banked ones', () => {
    // raise-barracks 20 + learn-volley 8, plus 5 in hand.
    const out = migrateV2ToV3(v2Save({ 'raise-barracks': 1, 'learn-volley': 1 }, 5), eco);
    expect(out.careerXp).toBe(3 * star + 5 + 28);
  });

  it('starts the build empty — a migration cannot guess which path you would walk', () => {
    const out = migrateV2ToV3(v2Save({ 'raise-barracks': 1 }, 0), eco);
    expect(out.build).toEqual([]);
    expect(out.loadout).toEqual([]);
  });

  it('carries campaign progress and endless bests across verbatim', () => {
    const before = v2Save({});
    const out = migrateV2ToV3(before, eco);
    expect(out.campaign).toEqual(before.campaign);
    expect(out.endlessBest).toEqual(before.endlessBest);
  });

  it('drops the retired fields entirely', () => {
    const out = migrateV2ToV3(v2Save({ 'the-tithe': 1 }, 9), eco) as SaveData & Record<string, unknown>;
    expect(out.tokens).toBeUndefined();
    expect(out.meta).toBeUndefined();
    expect(out.schemaVersion).toBe(3);
  });

  it('does not mutate the save it was handed', () => {
    const before = v2Save({ 'raise-barracks': 1 }, 3);
    migrateV2ToV3(before, eco);
    expect(before.meta!.ranks).toEqual({ 'raise-barracks': 1 });
    expect(before.tokens).toBe(3);
    expect(before.schemaVersion).toBe(2);
  });

  it('composes with v1 → v2, so a v1 save reaches v3 through the ladder', () => {
    const v1 = v1Save({ 'swift-steed': 2, 'raise-barracks': 1 }, 0);
    const out = migrateV2ToV3(migrateV1ToV2(v1), eco);
    // swift-steed refunded to tokens by the first step (25), raise-barracks
    // still sunk and refunded by the second (20).
    expect(out.careerXp).toBe(3 * star + 25 + 20);
  });
});

describe('career levels', () => {
  const eco = TEST_ECONOMY;
  const { base, growth } = eco.career.level;

  it('starts at level 1 with nothing earned', () => {
    expect(careerLevel(0, eco, 36)).toBe(1);
  });

  it('crosses exactly at the threshold, not one XP early or late', () => {
    expect(careerLevel(base - 1, eco, 36)).toBe(1);
    expect(careerLevel(base, eco, 36)).toBe(2);
    expect(careerLevel(base + base * growth - 1, eco, 36)).toBe(2);
    expect(careerLevel(base + base * growth, eco, 36)).toBe(3);
  });

  it('clamps at maxLevel however much XP is earned', () => {
    // The budget ceiling is the scarcity rule; XP past it must not buy points.
    expect(careerLevel(1e12, eco, 36)).toBe(36);
    expect(careerLevel(1e12, eco, 5)).toBe(5);
  });

  it('reports progress into the current level for the bar', () => {
    const p = careerProgress(base + 10, eco, 36);
    expect(p.level).toBe(2);
    expect(p.into).toBe(10);
    expect(p.needed).toBeCloseTo(base * growth);
  });

  it('reports a full bar at max level rather than a fraction of nothing', () => {
    const p = careerProgress(1e12, eco, 36);
    expect(p.level).toBe(36);
    expect(p.needed).toBe(0);
  });
});

describe('settleRun banks the run', () => {
  const eco = TEST_ECONOMY;

  it('adds the run XP as well as the star bonus', () => {
    const out = settleRun(
      newSave(),
      { mapId: 'm', victory: true, wavesCleared: 8, stars: 2, endless: false },
      eco,
      140,
    );
    expect(out.xpEarned).toBe(140 + 2 * eco.career.perStarFirstTime);
    expect(out.save.careerXp).toBe(out.xpEarned);
  });

  it('pays stars only on improvement, but banks the run XP every time', () => {
    let save = newSave();
    save = settleRun(save, { mapId: 'm', victory: true, wavesCleared: 8, stars: 2, endless: false }, eco, 100).save;
    const again = settleRun(save, { mapId: 'm', victory: true, wavesCleared: 8, stars: 2, endless: false }, eco, 100);
    // Replaying a cleared map still pays for the fighting — otherwise the only
    // way to fund the tree would be maps you have not beaten yet.
    expect(again.xpEarned).toBe(100);
  });

  it('counts three-starred maps for the points budget', () => {
    let save = newSave();
    save = settleRun(save, { mapId: 'a', victory: true, wavesCleared: 8, stars: 3, endless: false }, eco).save;
    save = settleRun(save, { mapId: 'b', victory: true, wavesCleared: 8, stars: 2, endless: false }, eco).save;
    expect(threeStarredMaps(save)).toBe(1);
  });
});

describe('newSave', () => {
  it('writes the current version, so a fresh save never needs migrating', () => {
    expect(newSave().schemaVersion).toBe(SAVE_VERSION);
  });

  it('starts with no XP, no build and no loadout', () => {
    const s = newSave();
    expect(s.careerXp).toBe(0);
    expect(s.build).toEqual([]);
    expect(s.loadout).toEqual([]);
  });
});
