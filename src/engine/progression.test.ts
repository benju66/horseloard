import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, migrateV1ToV2, newSave, type SaveData } from './progression';

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
function v1Save(ranks: Record<string, number>, tokens = 0): SaveData {
  return {
    schemaVersion: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    tokens,
    campaign: { 'meadow-road': { stars: 3, bestWavesCleared: 8, completed: true } },
    endlessBest: { 'meadow-road': 22 },
    meta: { ranks },
  };
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
    expect(out.meta.ranks).toEqual({});
  });

  it('keeps the nodes that survived, at their ranks', () => {
    // Volley and Rally Horn kept their ids. The player still has what they
    // bought; the price change is not worth clawing back.
    const out = migrateV1ToV2(v1Save({ 'learn-volley': 1, 'swift-steed': 1 }));
    expect(out.meta.ranks).toEqual({ 'learn-volley': 1 });
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
    expect(before.meta.ranks).toEqual({ 'swift-steed': 2 });
    expect(before.tokens).toBe(3);
    expect(before.schemaVersion).toBe(1);
  });

  it('stamps the new version', () => {
    expect(migrateV1ToV2(v1Save({})).schemaVersion).toBe(2);
  });

  it('is a no-op for a save that spent nothing', () => {
    const out = migrateV1ToV2(v1Save({}, 12));
    expect(out.tokens).toBe(12);
    expect(out.meta.ranks).toEqual({});
  });
});

describe('newSave', () => {
  it('writes the current version, so a fresh save never needs migrating', () => {
    expect(newSave().schemaVersion).toBe(SAVE_VERSION);
  });
});
