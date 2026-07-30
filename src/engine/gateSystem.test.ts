import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';

/**
 * Short lane (speed 50 → the end in 2s), gate hp 100, 5 slots. Hero parked
 * far from everything; his bow can't reach the gate area from (84,180)…
 * actually it can (range 50, gate at (0,110) is ~120 away) — safe.
 */
function gateFixture(waveCount = 7): SimData {
  const enemies: EnemiesFile = {
    elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
    enemies: [makeEnemy({ id: 'walker', speed: 50, hp: 10, siegeDps: 2 })],
  };
  return {
    enemies,
    map: makeMap({ heroSpawn: { x: 84, y: 180 } }),
    waveSet: {
      mapId: 'straight',
      waves: [
        {
          hpMultiplier: 1,
          entries: [{ enemyId: 'walker', count: waveCount, spacing: 0.2, laneId: 'main', delay: 0 }],
        },
      ],
    },
    hero: TEST_HERO,
    economy: TEST_ECONOMY,
    towers: makeTowersFile(),
  };
}

function advanceSeconds(sim: Simulation, seconds: number): void {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) sim.tick();
}

describe('walker → besieger state machine', () => {
  it('a leak walks to an attack slot and starts battering the gate', () => {
    const sim = new Simulation(gateFixture(1), TEST_RNG);
    sim.startNextWave();
    advanceSeconds(sim, 4); // 100u lane at 50u/s + slot walk
    const e = sim.enemySystem.enemies[0]!;
    expect(e.state).toBe('at-slot');
    expect(sim.gate.besiegerCount).toBe(1);
    expect(sim.gate.hp).toBeLessThan(sim.gate.maxHp);
    expect(sim.gate.totalDamageTaken).toBeCloseTo(sim.gate.maxHp - sim.gate.hp, 5);
    // still the final wave and the field isn't clean — no victory while the siege stands
    expect(sim.phase).toBe('wave');
  });

  it('caps simultaneous attackers at the slot count; overflow queues', () => {
    const sim = new Simulation(gateFixture(7), TEST_RNG);
    sim.startNextWave();
    advanceSeconds(sim, 6);
    expect(sim.enemySystem.aliveCount).toBe(7);
    expect(sim.gate.besiegerCount).toBe(5);
    expect(sim.gate.queueLength).toBe(2);
    // queue members stand behind the attack row and deal no damage
    const rate = 5 * 2; // 5 attackers × 2 dps — queue contributes nothing
    const before = sim.gate.hp;
    advanceSeconds(sim, 1);
    expect(before - sim.gate.hp).toBeCloseTo(rate, 1);
  });

  it('promotes from the queue when an attacker dies', () => {
    const sim = new Simulation(gateFixture(7), TEST_RNG);
    sim.startNextWave();
    advanceSeconds(sim, 6);
    const attackerId = sim.enemySystem.enemies.find((e) => sim.gate.besiegerCount > 0)!.id;
    // kill one slot occupant: a queued enemy takes the freed slot
    const anySlotOccupant = sim.enemySystem.enemies.find((e) => e.state === 'at-slot')!;
    void attackerId;
    sim.enemySystem.applyDamage(anySlotOccupant.id, 999);
    expect(sim.enemySystem.aliveCount).toBe(6);
    advanceSeconds(sim, 1.5); // promoted member walks into position
    expect(sim.gate.besiegerCount).toBe(5);
    expect(sim.gate.queueLength).toBe(1);
  });

  it('defeat at 0 hp freezes the sim', () => {
    const sim = new Simulation(gateFixture(7), TEST_RNG);
    sim.startNextWave();
    advanceSeconds(sim, 16); // 10 dps against 100 hp, siege starts ~2.5s in
    expect(sim.gate.hp).toBe(0);
    expect(sim.phase).toBe('defeat');
    const ticksBefore = sim.tickCount;
    advanceSeconds(sim, 1);
    expect(sim.tickCount).toBe(ticksBefore); // frozen
  });

  it('killing every besieger on the final wave is the victory condition', () => {
    const sim = new Simulation(gateFixture(2), TEST_RNG);
    sim.startNextWave();
    advanceSeconds(sim, 5);
    expect(sim.phase).toBe('wave'); // both parked at the gate
    for (const e of [...sim.enemySystem.enemies]) sim.enemySystem.applyDamage(e.id, 999);
    advanceSeconds(sim, SIM_DT * 2);
    expect(sim.phase).toBe('done');
  });
});

describe('repair (coin sink)', () => {
  it('restores in purchased chunks, capped at max hp, build phase only', () => {
    const sim = new Simulation(gateFixture(1), TEST_RNG);
    sim.startNextWave();
    advanceSeconds(sim, 4); // besieger chewing the gate
    expect(sim.repairGate()).toBe(false); // wave phase: no repairs mid-combat

    sim.enemySystem.applyDamage(sim.enemySystem.enemies[0]!.id, 999);
    advanceSeconds(sim, SIM_DT * 2); // final wave clean → done… which is not 'build' either
    expect(sim.phase).toBe('done');

    // Re-run with 2 waves so we land in a build phase with a damaged gate.
    const sim2 = new Simulation(
      { ...gateFixture(1), waveSet: { mapId: 'straight', waves: gateFixture(1).waveSet.waves.concat(gateFixture(1).waveSet.waves) } },
      TEST_RNG,
    );
    sim2.startNextWave();
    advanceSeconds(sim2, 4);
    sim2.enemySystem.applyDamage(sim2.enemySystem.enemies[0]!.id, 999);
    advanceSeconds(sim2, SIM_DT * 2);
    expect(sim2.phase).toBe('build');

    const damaged = sim2.gate.maxHp - sim2.gate.hp;
    expect(damaged).toBeGreaterThan(1);
    const quote = sim2.repairQuote()!;
    expect(quote.amount).toBeLessThanOrEqual(TEST_ECONOMY.repair.hpPerPurchase);
    const goldBefore = sim2.gold;
    expect(sim2.repairGate()).toBe(true);
    expect(sim2.gold).toBe(goldBefore - quote.cost);

    // damage taken is history — repair never reduces it (stars score on it)
    expect(sim2.gate.totalDamageTaken).toBeCloseTo(damaged, 5);

    // repair to full, then no more quotes
    let guard = 20;
    while (sim2.repairQuote() && guard-- > 0) {
      sim2.economy.gold += 100;
      sim2.repairGate();
    }
    expect(sim2.gate.hp).toBe(sim2.gate.maxHp);
    expect(sim2.repairQuote()).toBeNull();
    expect(sim2.repairGate()).toBe(false);
  });

  it('refuses without gold', () => {
    const data = gateFixture(1);
    data.waveSet.waves.push(data.waveSet.waves[0]!); // two waves → build phase exists
    data.economy = { ...TEST_ECONOMY, startingGold: 0 };
    const sim = new Simulation(data, TEST_RNG);
    sim.startNextWave();
    advanceSeconds(sim, 4);
    sim.enemySystem.applyDamage(sim.enemySystem.enemies[0]!.id, 999);
    advanceSeconds(sim, SIM_DT * 2);
    expect(sim.phase).toBe('build');
    // wave-clear bonus paid 10+3 — drain it
    sim.economy.gold = 0;
    expect(sim.repairGate()).toBe(false);
  });
});
