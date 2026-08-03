import { describe, expect, it } from 'vitest';
import { XpSystem } from './xpSystem';

/**
 * The draft's cadence lives here now (TRIANGLE.md §B.4), so the things worth
 * pinning are the ones that would silently cost a player cards: a level that
 * fires no event, a double level-up collapsed into one, or a curve that stops
 * producing levels on a long map.
 */

const CURVE = { base: 10, growth: 1.5, perKillDefault: 2, eliteMultiplier: 3 };

describe('levelling', () => {
  it('starts at level 1 with nothing banked', () => {
    const xp = new XpSystem(CURVE);
    expect(xp.level).toBe(1);
    expect(xp.progress).toBe(0);
    expect(xp.toNextLevel).toBe(10);
    expect(xp.fraction).toBe(0);
  });

  it('levels on the threshold and carries the remainder', () => {
    const xp = new XpSystem(CURVE);
    const levels: number[] = [];
    xp.onLevelUp.push((l) => levels.push(l));

    xp.gain(9);
    expect(xp.level).toBe(1);
    expect(levels).toEqual([]);

    xp.gain(4); // 13 total: crosses 10, banks 3
    expect(xp.level).toBe(2);
    expect(levels).toEqual([2]);
    expect(xp.progress).toBe(3);
    expect(xp.toNextLevel).toBe(15); // 10 × 1.5
  });

  it('fires once per level when a single award crosses several', () => {
    const xp = new XpSystem(CURVE);
    const levels: number[] = [];
    xp.onLevelUp.push((l) => levels.push(l));

    // 10 + 15 + 22.5 = 47.5 — three thresholds in one blow.
    xp.gain(50);
    // Collapsing these into one event would silently eat two drafts, which is
    // exactly what a big late elite kill would do.
    expect(levels).toEqual([2, 3, 4]);
    expect(xp.level).toBe(4);
    expect(xp.progress).toBeCloseTo(2.5);
  });

  it('uses the roster default when an enemy carries no xpValue', () => {
    const xp = new XpSystem(CURVE);
    xp.award(undefined, false);
    expect(xp.totalXp).toBe(2);
    // A new enemy must never be silently worth zero.
    xp.award(7, false);
    expect(xp.totalXp).toBe(9);
  });

  it('pays elites a multiple', () => {
    const xp = new XpSystem(CURVE);
    xp.award(4, true);
    expect(xp.totalXp).toBe(12);
  });

  it('ignores zero and negative awards', () => {
    const xp = new XpSystem(CURVE);
    xp.gain(0);
    xp.gain(-50);
    expect(xp.totalXp).toBe(0);
    expect(xp.level).toBe(1);
  });

  it('reports fractional progress for the HUD bar', () => {
    const xp = new XpSystem(CURVE);
    xp.gain(5);
    expect(xp.fraction).toBeCloseTo(0.5);
  });

  it('keeps producing levels indefinitely — endless has no last level', () => {
    // A hand-authored table would run out here; the geometric curve does not.
    const xp = new XpSystem({ ...CURVE, growth: 1.06 });
    xp.gain(100_000);
    expect(xp.level).toBeGreaterThan(50);
    expect(xp.toNextLevel).toBeGreaterThan(0);
  });
});
