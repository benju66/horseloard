import { describe, expect, it } from 'vitest';
import { PerksFileSchema, type PerksFile } from '../data/schemas';
import { PerkSystem } from './perkSystem';
import type { ModifiableData } from './metaModifiers';
import { TEST_ECONOMY, TEST_HERO, makeMap, makeTowersFile } from './testFixtures';

/**
 * The draft is the first system that mutates balance data *while the sim runs*,
 * so these tests care about two things above all: that a pick actually changes
 * what the game reads, and that the same seed deals the same cards. The second
 * is what lets `npm run bots` measure perk balance instead of only measuring
 * waves — without it the harness would be sampling noise.
 */

function data(): ModifiableData {
  return structuredClone({
    hero: TEST_HERO,
    economy: TEST_ECONOMY,
    towers: makeTowersFile(),
    map: makeMap(),
  });
}

/** Extra perks are *appended* to the base pool, never replace it. */
function pool(extra: unknown[] = [], rest: Record<string, unknown> = {}): PerksFile {
  return PerksFileSchema.parse({
    offerSize: 3,
    ...rest,
    perks: [
      { id: 'a', name: 'A', description: 'a', effects: [{ type: 'hero-stat', stat: 'moveSpeed', perRank: 1.1, mode: 'multiply' }], maxStacks: 2 },
      { id: 'b', name: 'B', description: 'b', effects: [{ type: 'hero-stat', stat: 'bowDamage', perRank: 5, mode: 'add' }], maxStacks: 3 },
      { id: 'c', name: 'C', description: 'c', effects: [{ type: 'kingdom-stat', stat: 'coinMagnetRadius', perRank: 2, mode: 'multiply' }], maxStacks: 1 },
      { id: 'd', name: 'D', description: 'd', effects: [{ type: 'tower-stat', towerId: null, stat: 'damage', perRank: 1.5, mode: 'multiply' }], maxStacks: 1 },
      ...extra,
    ],
  });
}

/** Deterministic, terrible, sufficient. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('dealing', () => {
  it('offers distinct cards — three of the same is not a choice', () => {
    for (let seed = 1; seed < 40; seed++) {
      const sys = new PerkSystem(pool(), data(), seededRng(seed));
      const offer = sys.deal()!;
      expect(offer).toHaveLength(3);
      expect(new Set(offer.map((p) => p.id)).size).toBe(3);
    }
  });

  it('deals the same cards for the same seed', () => {
    const first = new PerkSystem(pool(), data(), seededRng(7)).deal()!.map((p) => p.id);
    const second = new PerkSystem(pool(), data(), seededRng(7)).deal()!.map((p) => p.id);
    expect(second).toEqual(first);
  });

  it('shrinks the offer rather than repeating when the pool runs low', () => {
    const sys = new PerkSystem(pool(), data(), seededRng(3));
    // Exhaust everything except one single-stack perk.
    for (const id of ['a', 'a', 'b', 'b', 'b', 'c']) {
      sys.deal();
      // deal() may not include the target; force it by dealing until it does.
      let guard = 0;
      while (!sys.offer?.some((p) => p.id === id) && guard++ < 200) sys.deal();
      sys.take(id);
    }
    const offer = sys.deal()!;
    expect(offer.map((p) => p.id)).toEqual(['d']);
  });

  it('returns null once every perk is maxed', () => {
    const sys = new PerkSystem(pool(), data(), seededRng(5));
    for (const id of ['a', 'a', 'b', 'b', 'b', 'c', 'd']) {
      let guard = 0;
      do {
        sys.deal();
      } while (!sys.offer?.some((p) => p.id === id) && guard++ < 200);
      sys.take(id);
    }
    expect(sys.deal()).toBeNull();
    expect(sys.offer).toBeNull();
  });
});

describe('taking', () => {
  it('mutates the live config the systems read', () => {
    const d = data();
    const before = d.hero.moveSpeed;
    const sys = new PerkSystem(pool(), d, seededRng(1));
    let guard = 0;
    do {
      sys.deal();
    } while (!sys.offer?.some((p) => p.id === 'a') && guard++ < 200);

    expect(sys.take('a')).toBe(true);
    expect(d.hero.moveSpeed).toBeCloseTo(before * 1.1);
  });

  it('stacks compound exactly as one multi-rank application would', () => {
    const d = data();
    const before = d.hero.moveSpeed;
    const sys = new PerkSystem(pool(), d, seededRng(1));
    for (let i = 0; i < 2; i++) {
      let guard = 0;
      do {
        sys.deal();
      } while (!sys.offer?.some((p) => p.id === 'a') && guard++ < 200);
      sys.take('a');
    }
    expect(d.hero.moveSpeed).toBeCloseTo(before * 1.1 * 1.1);
    expect(sys.stacksOf('a')).toBe(2);
  });

  it('refuses a perk that is not on offer', () => {
    const d = data();
    const before = d.hero.moveSpeed;
    const sys = new PerkSystem(pool(), d, seededRng(1));
    sys.deal();
    // Nothing is offered under this id, and nothing may be taken by name alone.
    expect(sys.take('not-a-perk')).toBe(false);
    expect(d.hero.moveSpeed).toBe(before);
  });

  it('refuses to exceed maxStacks', () => {
    const d = data();
    const sys = new PerkSystem(pool(), d, seededRng(2));
    let guard = 0;
    do {
      sys.deal();
    } while (!sys.offer?.some((p) => p.id === 'c') && guard++ < 200);
    expect(sys.take('c')).toBe(true);

    // 'c' is single-stack, so it must never be dealt again.
    for (let i = 0; i < 50; i++) {
      const offer = sys.deal();
      expect(offer?.some((p) => p.id === 'c')).toBeFalsy();
    }
  });

  it('clears the offer, so one wave clear buys exactly one perk', () => {
    const sys = new PerkSystem(pool(), data(), seededRng(9));
    const offer = sys.deal()!;
    expect(sys.take(offer[0]!.id)).toBe(true);
    expect(sys.offer).toBeNull();
    expect(sys.take(offer[1]!.id)).toBe(false);
  });

  it('routes gate capacity out rather than writing it, because GateSystem copies it', () => {
    const d = data();
    const withGate = pool([
      {
        id: 'gate',
        name: 'Gate',
        description: 'g',
        effects: [{ type: 'kingdom-stat', stat: 'gateMaxHp', perRank: 25, mode: 'add' }],
        maxStacks: 1,
        weight: 1,
      },
    ]);
    const sys = new PerkSystem(withGate, d, seededRng(4));
    const deltas: number[] = [];
    sys.onGateMaxHpChanged.push((delta) => deltas.push(delta));

    let guard = 0;
    do {
      sys.deal();
    } while (!sys.offer?.some((p) => p.id === 'gate') && guard++ < 200);
    sys.take('gate');

    expect(deltas).toEqual([25]);
  });
});

/**
 * Tradeoffs and grants are the whole reason the pool was rewritten: a card that
 * only ever gives is a preference, not a decision. These cover the two shapes
 * that make a pick cost something or change a rule.
 */
describe('tradeoffs and grants', () => {
  /** Deal until `id` is on the table, then take it. */
  function drawAndTake(sys: PerkSystem, id: string): boolean {
    let guard = 0;
    do {
      sys.deal();
    } while (!sys.offer?.some((p) => p.id === id) && guard++ < 400);
    return sys.take(id);
  }

  it('applies every effect of a perk, upside and downside together', () => {
    const d = data();
    const beforeDamage = d.hero.bow.levels[0]!.damage;
    const beforeInterval = d.hero.bow.levels[0]!.fireInterval;

    const sys = new PerkSystem(
      pool([
        {
          id: 'trade',
          name: 'Trade',
          description: 'harder, slower',
          effects: [
            { type: 'hero-stat', stat: 'bowDamage', perRank: 1.5, mode: 'multiply' },
            { type: 'hero-stat', stat: 'bowFireRate', perRank: 0.8, mode: 'multiply' },
          ],
          maxStacks: 1,
          weight: 1,
        },
      ]),
      d,
      seededRng(21),
    );

    expect(drawAndTake(sys, 'trade')).toBe(true);
    expect(d.hero.bow.levels[0]!.damage).toBeCloseTo(beforeDamage * 1.5);
    // fireRate < 1 lengthens the interval — the cost has to actually land.
    expect(d.hero.bow.levels[0]!.fireInterval).toBeCloseTo(beforeInterval / 0.8);
  });

  it('reports a negative gate delta when a perk trades capacity away', () => {
    const d = data();
    const sys = new PerkSystem(
      pool([
        {
          id: 'strip',
          name: 'Strip',
          description: 'cheap towers, weaker keep',
          effects: [
            { type: 'tower-stat', towerId: null, stat: 'cost', perRank: 0.8, mode: 'multiply' },
            { type: 'kingdom-stat', stat: 'gateMaxHp', perRank: -20, mode: 'add' },
          ],
          maxStacks: 1,
          weight: 1,
        },
      ]),
      d,
      seededRng(33),
    );
    const deltas: number[] = [];
    sys.onGateMaxHpChanged.push((delta) => deltas.push(delta));

    expect(drawAndTake(sys, 'strip')).toBe(true);
    expect(deltas).toEqual([-20]);
  });

  it('grants a mechanic a tower did not ship with', () => {
    const d = data();
    // Nothing in the fixture roster crits to begin with.
    expect(d.towers.towers.every((t) => t.levels.every((l) => l.crit === undefined))).toBe(true);

    const sys = new PerkSystem(
      pool([
        {
          id: 'oath',
          name: 'Oath',
          description: 'towers can crit',
          effects: [
            { type: 'tower-grant', towerId: null, grant: { kind: 'crit', chance: 0.25, multiplier: 2 } },
          ],
          maxStacks: 2,
          weight: 1,
        },
      ]),
      d,
      seededRng(44),
    );

    expect(drawAndTake(sys, 'oath')).toBe(true);
    for (const tower of d.towers.towers) {
      for (const level of tower.levels) {
        expect(level.crit).toEqual({ chance: 0.25, multiplier: 2 });
      }
    }

    // A second stack accumulates chance but must not compound the multiplier.
    expect(drawAndTake(sys, 'oath')).toBe(true);
    const first = d.towers.towers[0]!.levels[0]!;
    expect(first.crit!.chance).toBeCloseTo(0.5);
    expect(first.crit!.multiplier).toBe(2);
  });

  it('caps granted crit chance at certainty however many stacks land', () => {
    const d = data();
    const sys = new PerkSystem(
      pool([
        {
          id: 'oath',
          name: 'Oath',
          description: 'towers can crit',
          effects: [
            { type: 'tower-grant', towerId: null, grant: { kind: 'crit', chance: 0.6, multiplier: 2 } },
          ],
          maxStacks: 3,
          weight: 1,
        },
      ]),
      d,
      seededRng(55),
    );
    for (let i = 0; i < 3; i++) drawAndTake(sys, 'oath');
    expect(d.towers.towers[0]!.levels[0]!.crit!.chance).toBe(1);
  });
});

describe('bookkeeping', () => {
  it('reports what was taken, for the HUD and the run summary', () => {
    const sys = new PerkSystem(pool(), data(), seededRng(11));
    let guard = 0;
    do {
      sys.deal();
    } while (!sys.offer?.some((p) => p.id === 'b') && guard++ < 200);
    sys.take('b');

    expect(sys.takenPerks).toEqual([{ perk: expect.objectContaining({ id: 'b' }), stacks: 1 }]);
  });

  it('skipping spends the card without granting anything', () => {
    const d = data();
    const before = d.hero.moveSpeed;
    const sys = new PerkSystem(pool(), d, seededRng(6));
    sys.deal();
    sys.skip();
    expect(sys.offer).toBeNull();
    expect(d.hero.moveSpeed).toBe(before);
  });
});
