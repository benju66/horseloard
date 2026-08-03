import { describe, expect, it } from 'vitest';
import { generateEndlessWave } from './endless';
import { settleRun, newSave } from './progression';
import { Simulation, type SimData, type SimPhase } from './simulation';

/** Reads `phase` across a call boundary: assigning it narrows the type to that
 *  literal, which would make every later comparison look unreachable to TS. */
const phaseOf = (sim: Simulation): SimPhase => sim.phase;
import type { EnemiesFile, Economy } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';

/**
 * Endless mode had no test at all until MG.7's parity pass went looking for it.
 * It is engine logic on two axes CLAUDE.md asks to be covered — wave budgets and
 * economy math — and it is the mode where a mistake is least visible, because
 * nobody plays wave 40 of a campaign map by accident.
 *
 * Two of these guard bugs the 3D shell could reintroduce rather than anything
 * currently broken: that endless never declares victory, and that generating
 * waves does not write back into the caller's wave set.
 */

const enemies: EnemiesFile = {
  elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
  enemies: [
    makeEnemy({ id: 'fodder', speed: 40, hp: 8, coinValue: 3 }),
    makeEnemy({ id: 'heavy', speed: 22, hp: 60, coinValue: 15 }),
    // Excluded from endless by design: a boss trait and a looter. Both traits
    // are config blocks, not flags - the generator filters on their presence.
    makeEnemy({
      id: 'boss', speed: 18, hp: 400, coinValue: 40,
      warCry: { radius: 60, speedMultiplier: 1.3, duration: 3, interval: 8 },
    }),
    makeEnemy({
      id: 'thief', speed: 55, hp: 10, coinValue: 5,
      lootsCoins: { detectRadius: 70, fleeSpeedMultiplier: 1.5 },
    }),
  ],
};

function fixture(endless: boolean): SimData {
  return {
    enemies,
    map: makeMap({ heroSpawn: { x: 84, y: 180 } }),
    waveSet: {
      mapId: 'straight',
      waves: [
        { hpMultiplier: 1, entries: [{ enemyId: 'fodder', count: 1, spacing: 0.2, laneId: 'main', delay: 0 }] },
      ],
    },
    hero: TEST_HERO,
    economy: TEST_ECONOMY,
    towers: makeTowersFile(),
    endless,
  };
}

describe('endless wave generation', () => {
  it('excludes boss-trait and looter enemies at every depth', () => {
    // Sampled across the curve rather than at one n: the weighting shifts with
    // depth, so a filter that held at n=1 could still admit a boss at n=40.
    for (const n of [1, 5, 12, 25, 40]) {
      const wave = generateEndlessWave(n, enemies, makeMap(), TEST_RNG);
      const ids = wave.entries.map((e) => e.enemyId);
      expect(ids, `wave ${n}`).not.toContain('boss');
      expect(ids, `wave ${n}`).not.toContain('thief');
      expect(ids.length, `wave ${n} must not be empty`).toBeGreaterThan(0);
    }
  });

  it('scales hp without limit and spends a growing budget', () => {
    const early = generateEndlessWave(2, enemies, makeMap(), TEST_RNG);
    const late = generateEndlessWave(30, enemies, makeMap(), TEST_RNG);
    expect(late.hpMultiplier).toBeGreaterThan(early.hpMultiplier);

    const bodies = (w: { entries: ReadonlyArray<{ count: number }> }) =>
      w.entries.reduce((s, e) => s + e.count, 0);
    expect(bodies(late)).toBeGreaterThan(bodies(early));
  });

  it('assigns every entry to a lane the map actually declares', () => {
    const map = makeMap();
    const lanes = new Set(map.lanes.map((l) => l.id));
    const wave = generateEndlessWave(9, enemies, map, TEST_RNG);
    for (const entry of wave.entries) expect(lanes.has(entry.laneId)).toBe(true);
  });

  it('does not mutate the enemies file it reads from', () => {
    const before = JSON.stringify(enemies);
    generateEndlessWave(7, enemies, makeMap(), TEST_RNG);
    expect(JSON.stringify(enemies)).toBe(before);
  });
});

describe('endless mode in the simulation', () => {
  it('appends a wave when the authored set runs out; campaign mode does not', () => {
    const forever = new Simulation(fixture(true), TEST_RNG);
    const campaign = new Simulation(fixture(false), TEST_RNG);
    expect(forever.waveRunner.totalWaves).toBe(1);

    forever.startNextWave();
    campaign.startNextWave();
    // The authored wave is spent; only endless manufactures another.
    expect(forever.waveRunner.totalWaves).toBe(1);

    forever.phase = 'build';
    campaign.phase = 'build';
    expect(forever.startNextWave()).toBe(true);
    expect(forever.waveRunner.totalWaves).toBe(2);
    expect(campaign.startNextWave()).toBe(false);
    expect(campaign.waveRunner.totalWaves).toBe(1);
  });

  it('keeps manufacturing waves far past the authored set', () => {
    const sim = new Simulation(fixture(true), TEST_RNG);
    for (let i = 0; i < 15; i++) {
      sim.phase = 'build';
      expect(sim.startNextWave(), `wave ${i + 1}`).toBe(true);
    }
    expect(sim.waveRunner.totalWaves).toBe(15);
    expect(phaseOf(sim)).not.toBe('done');
  });

  it('never declares victory — endless ends only in defeat', () => {
    const sim = new Simulation(fixture(true), TEST_RNG);
    for (let i = 0; i < 12; i++) {
      sim.phase = 'build';
      sim.startNextWave();
      // Run the wave out; nothing here should ever flip the sim to 'done'.
      for (let t = 0; t < 600 && phaseOf(sim) === 'wave'; t++) sim.tick();
      expect(phaseOf(sim), `after wave ${i + 1}`).not.toBe('done');
      if (phaseOf(sim) === 'defeat') break;
    }
  });
});

describe('endless progression payout', () => {
  // Payout rules live under economy.career, not at the top level — overriding
  // the flat names silently does nothing and leaves the defaults in play.
  const economy: Economy = {
    ...TEST_ECONOMY,
    career: { ...TEST_ECONOMY.career, endlessMilestoneEvery: 5, perEndlessMilestone: 3 },
  };
  const every = economy.career.endlessMilestoneEvery;

  it('pays only for milestones newly reached, and records the best', () => {
    let save = newSave();

    const first = settleRun(save, { mapId: 'm', victory: false, wavesCleared: every * 2, stars: 1, endless: true }, economy);
    save = first.save;
    expect(save.endlessBest['m']).toBe(every * 2);
    const paidFirst = save.careerXp;
    expect(paidFirst).toBeGreaterThan(0);

    // A worse run pays nothing and must not lower the record — the classic
    // high-score bug is writing the latest value instead of the maximum.
    const worse = settleRun(save, { mapId: 'm', victory: false, wavesCleared: every, stars: 1, endless: true }, economy);
    save = worse.save;
    expect(save.endlessBest['m']).toBe(every * 2);
    expect(save.careerXp).toBe(paidFirst);

    // A better run pays only for the milestones above the previous best.
    const better = settleRun(save, { mapId: 'm', victory: false, wavesCleared: every * 3, stars: 1, endless: true }, economy);
    save = better.save;
    expect(save.endlessBest['m']).toBe(every * 3);
    expect(save.careerXp).toBeGreaterThan(paidFirst);
  });

  it('does not award campaign stars', () => {
    // Stars are the campaign's currency; DESIGN scores them on damage taken.
    // An endless run reaching wave 50 must not backfill a map's rating.
    const save = newSave();
    const out = settleRun(save, { mapId: 'm', victory: false, wavesCleared: 50, stars: 3, endless: true }, economy);
    expect(out.save.campaign['m']?.stars ?? 0).toBe(0);
  });
});
