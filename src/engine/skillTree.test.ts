import { describe, expect, it } from 'vitest';
import { SkillTree, type SkillTreeState } from './skillTree';
import type { SkillTreeFile } from '../data/schemas';

/**
 * The allocator, tested against a hand-built tree rather than `skilltree.json`.
 *
 * Deliberate: these assert the *rules* — prerequisites, exclusivity, cascading
 * refunds — and a fixture that names no shipped node keeps them from breaking
 * every time the content moves. The shipped tree's own shape is guarded by its
 * schema and by the Part F probes.
 */

const bump = (stat: 'bowDamage') => [
  { type: 'hero-stat' as const, stat, perRank: 1.1, mode: 'multiply' as const },
];

/**
 *   hunt          ride
 *   a (1)         d (1)
 *   b (2) ← a     e (2) ← d
 *   c (3) ← b
 *   k1 (3) ← b ⊗ k2      k2 (3) ← b ⊗ k1
 */
const FILE: SkillTreeFile = {
  pointsPerLevel: 1,
  maxLevel: 10,
  pointsPerThreeStar: 1,
  poolNames: { hero: 'Hero', kingdom: 'Kingdom' },
  maxAllocatableFraction: 0.9,
  nodes: [
    { id: 'a', path: 'hunt', pool: 'hero', icon: '⬢', kind: 'minor', name: 'A', description: 'a', cost: 1, row: 0, requires: [], excludes: [], effects: bump('bowDamage') },
    { id: 'b', path: 'hunt', pool: 'hero', icon: '⬢', kind: 'notable', name: 'B', description: 'b', cost: 2, row: 1, requires: ['a'], excludes: [], effects: bump('bowDamage') },
    { id: 'c', path: 'hunt', pool: 'hero', icon: '⬢', kind: 'notable', name: 'C', description: 'c', cost: 3, row: 2, requires: ['b'], excludes: [], effects: bump('bowDamage') },
    { id: 'k1', path: 'hunt', pool: 'hero', icon: '⬢', kind: 'keystone', name: 'K1', description: 'k1', cost: 3, row: 3, requires: ['b'], excludes: ['k2'], effects: bump('bowDamage') },
    { id: 'k2', path: 'hunt', pool: 'hero', icon: '⬢', kind: 'keystone', name: 'K2', description: 'k2', cost: 3, row: 3, requires: ['b'], excludes: ['k1'], effects: bump('bowDamage') },
    { id: 'd', path: 'ride', pool: 'hero', icon: '⬢', kind: 'minor', name: 'D', description: 'd', cost: 1, row: 0, requires: [], excludes: [], effects: bump('bowDamage') },
    { id: 'e', path: 'ride', pool: 'hero', icon: '⬢', kind: 'ability', name: 'E', description: 'e', cost: 2, row: 1, requires: ['d'], excludes: [], effects: [{ type: 'unlock-ability', abilityId: 'volley' }] },
  ],
};

const tree = new SkillTree(FILE);
const state = (allocated: string[], pointsEarned = 20): SkillTreeState => ({ allocated, pointsEarned });

describe('points', () => {
  it('grants one a level, every level, plus one per map three-starred', () => {
    // Cadence is the point: a schedule that skips levels means most level-ups
    // hand out nothing, in a game whose whole spine is levelling.
    expect(tree.pointsAt(6, 2)).toBe(8);
  });

  it('stops granting past maxLevel — the scarcity ceiling is the whole design', () => {
    expect(tree.pointsAt(999, 0)).toBe(10);
  });

  it('sums the cost of what is held, ignoring ids it does not know', () => {
    expect(tree.spent(['a', 'b', 'd', 'ghost'])).toBe(4);
  });

  it('reports what is left', () => {
    expect(tree.free(['a', 'b'], 10)).toBe(7);
  });

  it('totals a single half\'s node cost, for reporting rather than for gating', () => {
    expect(tree.totalCost('hero')).toBe(tree.totalCost());
  });
});

describe('refusal reports which wall you hit', () => {
  it('names an unknown node rather than pretending it is locked', () => {
    expect(tree.refusal('ghost', state([]))).toBe('unknown');
  });

  it('refuses a node already held', () => {
    expect(tree.refusal('a', state(['a']))).toBe('already-taken');
  });

  it('refuses a node whose prerequisite is not held', () => {
    expect(tree.refusal('b', state([]))).toBe('missing-prerequisite');
  });

  it('refuses a keystone whose twin is held', () => {
    expect(tree.refusal('k2', state(['a', 'b', 'k1']))).toBe('excluded');
  });

  it('refuses what the career cannot afford', () => {
    // a(1) + b(2) = 3 spent, c costs 3, only 5 earned.
    expect(tree.refusal('c', state(['a', 'b'], 5))).toBe('too-expensive');
    expect(tree.refusal('c', state(['a', 'b'], 6))).toBeNull();
  });

  it('spends one budget across both halves', () => {
    // A kingdom node and a hero node draw on the same points — freedom to build
    // what you want is the whole reason the two-budget version was retired.
    const held = tree.allocate('d', state([], 3));
    expect(tree.refusal('a', { allocated: held, pointsEarned: 3 })).toBeNull();
    expect(tree.spent(held)).toBe(1);
  });

  it('allows a root node in any path at any time', () => {
    expect(tree.refusal('d', state(['a', 'b', 'c']))).toBeNull();
  });
});

describe('allocate', () => {
  it('adds the node', () => {
    expect(tree.allocate('a', state([]))).toEqual(['a']);
  });

  it('returns the allocation unchanged when refused, rather than throwing', () => {
    // The screen calls this on every tap; a refusal is a normal outcome.
    const held = ['a'];
    expect(tree.allocate('c', state(held))).toBe(held);
  });
});

describe('deallocate cascades', () => {
  it('drops everything that depended on the refunded node', () => {
    const out = tree.deallocate('a', state(['a', 'b', 'c']));
    expect(out).toEqual([]);
  });

  it('reaches dependents more than one row down', () => {
    // c depends on b depends on a — a single pass would leave c held and
    // unreachable, a state the allocator could never have produced.
    const out = tree.deallocate('b', state(['a', 'b', 'c', 'k1']));
    expect(out).toEqual(['a']);
  });

  it('leaves other paths alone', () => {
    const out = tree.deallocate('a', state(['a', 'b', 'd', 'e']));
    expect(out).toEqual(['d', 'e']);
  });

  it('is a no-op for a node not held', () => {
    const held = ['a'];
    expect(tree.deallocate('c', state(held))).toBe(held);
  });
});

describe('respec', () => {
  it('empties the build — free, always', () => {
    expect(tree.respec()).toEqual([]);
  });
});

describe('reconcile', () => {
  it('keeps a build that is still legal, in a buildable order', () => {
    expect(tree.reconcile(['c', 'b', 'a'], 20)).toEqual(['a', 'b', 'c']);
  });

  it('drops nodes whose prerequisites are missing', () => {
    // Rebuilt forward from nothing, so an orphan cannot survive by being
    // checked against the very set it belongs to.
    expect(tree.reconcile(['b', 'c'], 20)).toEqual([]);
  });

  it('drops the second of two mutually exclusive keystones', () => {
    expect(tree.reconcile(['a', 'b', 'k1', 'k2'], 20)).toEqual(['a', 'b', 'k1']);
  });

  it('drops what a shrunken budget can no longer pay for', () => {
    expect(tree.reconcile(['a', 'b', 'c'], 3)).toEqual(['a', 'b']);
  });

  it('ignores ids that no longer exist in the data', () => {
    expect(tree.reconcile(['a', 'retired-node'], 20)).toEqual(['a']);
  });
});

describe('applyTo', () => {
  const data = () => ({
    hero: {
      moveSpeed: 100,
      bow: { levels: [{ damage: 10, range: 100, fireInterval: 1, cost: 0 }] },
      trample: { damage: 5 },
      stagger: { shoveDistance: 10, controlLossDuration: 0.4, immunityAfter: 0 },
      crit: { chance: 0, multiplier: 2 },
      damageVsHindered: 1,
    },
    economy: { startingGold: 100 },
    towers: { towers: [], projectiles: [] },
    map: { gate: { hp: 100 } },
    abilities: [],
  }) as never;

  it('does not mutate the data it was handed', () => {
    const input = data();
    tree.applyTo(input, ['a']);
    expect((input as { hero: { bow: { levels: { damage: number }[] } } }).hero.bow.levels[0]!.damage).toBe(10);
  });

  it('composes every held node', () => {
    const out = tree.applyTo(data(), ['a', 'd']);
    expect(out.hero.bow.levels[0]!.damage).toBeCloseTo(10 * 1.1 * 1.1);
  });

  it('returns unlocks rather than applying them — they are a system\'s decision', () => {
    const out = tree.applyTo(data(), ['d', 'e']);
    expect(out.unlockedAbilityIds).toEqual(['volley']);
  });

  it('ignores ids it does not know instead of failing a run', () => {
    // A save from a build whose tree had a node this one does not must still
    // load. `reconcile` is the place that reports it; this must not crash.
    expect(() => tree.applyTo(data(), ['ghost'])).not.toThrow();
  });
});
