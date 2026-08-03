import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile, WaveSet } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';

/**
 * The rule effects (SKILLTREE.md) — nodes that change what the game *does*.
 *
 * These get tests where the stat nodes they replaced did not, and the reason is
 * the whole point of having them: a stat that fails to apply is a number that
 * is slightly wrong, while a rule that fails to apply is a node that silently
 * does nothing at all. The second is invisible from inside the game and reads
 * as the node being weak rather than broken — the worst bug class a build game
 * has.
 *
 * Content-agnostic throughout: the fixture's enemy is called "walker" and
 * nothing here would change if it were called anything else.
 */

function fixture(
  rules: string[],
  overrides?: { armor?: number; hp?: number; waves?: WaveSet['waves'] },
): SimData {
  const enemies: EnemiesFile = {
    elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
    // Default hp is low so waves actually clear — the phase stops ticking once
    // they do, which is exactly what a rule tied to a wave clear needs. The
    // armour tests raise it, and drive `enemySystem` directly for the same
    // reason: a fat enemy reaches the gate, besieges, and the wave ends.
    enemies: [
      makeEnemy({ id: 'walker', name: 'Walker', hp: overrides?.hp ?? 10, armor: overrides?.armor ?? 0 }),
    ],
  };
  const waveSet: WaveSet = {
    mapId: 'straight',
    waves: overrides?.waves ?? [
      {
        hpMultiplier: 1,
        entries: [{ enemyId: 'walker', count: 2, spacing: 1, laneId: 'main', delay: 0 }],
      },
    ],
  };
  return {
    enemies,
    map: makeMap(),
    waveSet,
    hero: TEST_HERO,
    economy: TEST_ECONOMY,
    towers: makeTowersFile(),
    rules,
  };
}

const advance = (sim: Simulation, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) sim.tick();
};

describe('rules are off unless the build switched them on', () => {
  it('a run with no rules has none of them', () => {
    const sim = new Simulation(fixture([]), TEST_RNG);
    expect(sim.rules.size).toBe(0);
    expect(sim.economy.coinsNeverExpire).toBe(false);
    expect(sim.towerSystem.fullSalvage).toBe(false);
  });

  it('ignores a rule id it does not recognise instead of failing the run', () => {
    // A save from a build whose tree had a rule this one does not must still
    // load and play. Loud at the schema, quiet here.
    expect(() => new Simulation(fixture(['no-such-rule']), TEST_RNG)).not.toThrow();
  });
});

describe('crit-vs-hindered', () => {
  it('switches on only when the build holds the rule', () => {
    expect(new Simulation(fixture(['crit-vs-hindered']), TEST_RNG).hero.critVsHindered).toBe(true);
    expect(new Simulation(fixture([]), TEST_RNG).hero.critVsHindered).toBe(false);
  });

  /**
   * This rule exists because the one it replaced did nothing.
   *
   * `hero-ignores-armor` shipped in the first draft and this suite caught it
   * dead on arrival: `hero.json` already sets `ignoresArmor: true`, so the node
   * would have cost a point and changed no number in the game. That is exactly
   * the failure rules were introduced to be tested against — invisible from
   * inside the game, and indistinguishable from a weak node.
   *
   * Left as a note rather than a fix: making the hero's bow respect armour is a
   * real balance change (it would give the shieldbearer meaning against the
   * hero pillar for the first time) and belongs in the M7.3 retune, not here.
   */
  it('is a rule the shipped hero does not already have — unlike the one it replaced', () => {
    expect(TEST_HERO.bow.projectile.ignoresArmor).toBe(true);
  });
});

describe('zones-strip-armor', () => {
  it('drops armour while an enemy stands in the patch, and restores it after', () => {
    const sim = new Simulation(fixture(['zones-strip-armor'], { armor: 0.5, hp: 1000 }), TEST_RNG);
    sim.startNextWave();
    advance(sim, 0.1);
    const e = sim.enemySystem.enemies[0]!;

    sim.enemySystem.stripArmor(e.id, 1);
    let before = e.hp;
    sim.enemySystem.applyDamage(e.id, 100);
    expect(before - e.hp).toBeCloseTo(100);

    // It is a countdown, not a flag: an enemy that leaves the patch has to get
    // its armour back, and a flag would need a clear on exit that nothing fires.
    // Driven directly rather than through `sim.tick` — a 1000hp enemy reaches
    // the gate and besieges, the wave ends, and the phase stops ticking.
    sim.enemySystem.tick(1.2);
    before = e.hp;
    sim.enemySystem.applyDamage(e.id, 100);
    expect(before - e.hp).toBeCloseTo(50);
  });

  it('refreshes rather than accumulating', () => {
    const sim = new Simulation(fixture(['zones-strip-armor'], { armor: 0.5, hp: 1000 }), TEST_RNG);
    sim.startNextWave();
    advance(sim, 0.1);
    const e = sim.enemySystem.enemies[0]!;
    sim.enemySystem.stripArmor(e.id, 2);
    sim.enemySystem.stripArmor(e.id, 1); // shorter must not shorten it
    expect(e.armorStrippedFor).toBeCloseTo(2);
  });
});

describe('coins-never-expire', () => {
  it('keeps coins on the ground through combat', () => {
    const sim = new Simulation(fixture(['coins-never-expire']), TEST_RNG);
    sim.startNextWave();
    sim.economy.spawnCoins(5, 5, 3);
    const n = sim.economy.coins.length;
    expect(n).toBeGreaterThan(0);
    // Well past the fixture's expiry window.
    advance(sim, TEST_ECONOMY.coins.expirySeconds * 2);
    expect(sim.economy.coins.length).toBe(n);
  });

  it('expires them when the rule is off — the control', () => {
    const sim = new Simulation(fixture([]), TEST_RNG);
    sim.startNextWave();
    sim.economy.spawnCoins(5, 5, 3);
    advance(sim, TEST_ECONOMY.coins.expirySeconds * 2);
    expect(sim.economy.coins.length).toBe(0);
  });
});

describe('full-salvage', () => {
  const buildThenSell = (rules: string[]): { cost: number; back: number } => {
    const sim = new Simulation(fixture(rules), TEST_RNG);
    const plot = sim.towerSystem.plots[0]!;
    const cost = sim.towerSystem.buildCost('bolt-tower') ?? 0;
    sim.economy.gold = cost;
    sim.buildTower(plot.plotId, 'bolt-tower');
    const before = sim.economy.gold;
    sim.sellTower(plot.plotId);
    return { cost, back: sim.economy.gold - before };
  };

  it('returns everything invested rather than a fraction', () => {
    const { cost, back } = buildThenSell(['full-salvage']);
    expect(back).toBe(cost);
  });

  it('returns only the configured fraction when off — the control', () => {
    const { cost, back } = buildThenSell([]);
    expect(back).toBe(Math.floor(cost * TEST_ECONOMY.sellRefund));
  });
});

describe('first-tower-free', () => {
  it('prices the first build of a phase at nothing and the second normally', () => {
    const sim = new Simulation(fixture(['first-tower-free']), TEST_RNG);
    const list = sim.towerSystem.buildCost('bolt-tower') ?? 0;
    expect(sim.buildPrice('bolt-tower')).toBe(0);

    sim.economy.gold = 0; // broke, and it still goes up
    expect(sim.buildTower(sim.towerSystem.plots[0]!.plotId, 'bolt-tower')).toBe(true);
    expect(sim.buildPrice('bolt-tower')).toBe(list);
  });

  it('does not burn the allowance on a build that was refused', () => {
    const sim = new Simulation(fixture(['first-tower-free']), TEST_RNG);
    // Same plot twice: the second is refused because the plot is taken.
    const plot = sim.towerSystem.plots[0]!.plotId;
    sim.buildTower(plot, 'bolt-tower');
    const sim2 = new Simulation(fixture(['first-tower-free']), TEST_RNG);
    expect(sim2.buildTower('no-such-plot', 'bolt-tower')).toBe(false);
    expect(sim2.buildPrice('bolt-tower')).toBe(0);
  });

  it('renews the allowance every wave, not once a run', () => {
    const sim = new Simulation(fixture(['first-tower-free']), TEST_RNG);
    sim.buildTower(sim.towerSystem.plots[0]!.plotId, 'bolt-tower');
    expect(sim.buildPrice('bolt-tower')).toBeGreaterThan(0);
    sim.startNextWave();
    advance(sim, 60); // let the wave resolve
    expect(sim.buildPrice('bolt-tower')).toBe(0);
  });
});

describe('soldiers-reform', () => {
  it('clears every respawn timer on a wave clear', () => {
    const sim = new Simulation(fixture(['soldiers-reform']), TEST_RNG);
    sim.startNextWave();
    advance(sim, 60);
    for (const s of sim.army.soldiers) expect(s.respawnIn).toBe(0);
  });
});
