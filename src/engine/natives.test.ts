import { describe, expect, it } from 'vitest';
import { SIM_DT, Simulation, type SimData } from './simulation';
import type { EnemiesFile, WaveSet } from '../data/schemas';
import { TEST_ECONOMY, TEST_HERO, TEST_RNG, makeEnemy, makeMap, makeTowersFile } from './testFixtures';

/**
 * The biome natives (BIOMES.md Part K.3/K.4) — both are rules about *where*
 * damage and attention go, and a rule that silently fails reads as a weak
 * enemy rather than a broken one. Content-agnostic: "bearer" and "shadow"
 * are fixture names.
 */

function fixture(extra: Parameters<typeof makeEnemy>[0][]): SimData {
  const enemies: EnemiesFile = {
    elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
    enemies: [makeEnemy({ id: 'walker', name: 'Walker', hp: 100 }), ...extra.map(makeEnemy)],
  };
  const waveSet: WaveSet = {
    mapId: 'straight',
    waves: [
      { hpMultiplier: 1, entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }] },
    ],
  };
  return {
    enemies,
    map: makeMap(),
    waveSet,
    hero: TEST_HERO,
    economy: TEST_ECONOMY,
    towers: makeTowersFile(),
    abilities: [],
  };
}

describe('ward (the Warden)', () => {
  const WARD = { radius: 80, factor: 0.5, duration: 3, interval: 1 };

  it('shields every OTHER enemy in radius, never the bearer', () => {
    const sim = new Simulation(fixture([{ id: 'bearer', name: 'Bearer', hp: 100, ward: WARD }]), TEST_RNG);
    const walker = sim.enemySystem.spawn('walker', 'main', 1);
    const bearer = sim.enemySystem.spawn('bearer', 'main', 1);
    // let the pulse fire (cooldown starts at interval * 0.4)
    for (let i = 0; i < 30; i++) sim.enemySystem.tick(SIM_DT);
    expect(walker.wardRemaining).toBeGreaterThan(0);
    expect(bearer.wardRemaining).toBe(0); // focusing the Warden must work

    sim.enemySystem.applyDamage(walker.id, 20);
    expect(walker.hp).toBe(90); // 20 × 0.5
    sim.enemySystem.applyDamage(bearer.id, 20);
    expect(bearer.hp).toBe(80); // full damage
  });

  it('the ward expires and full damage resumes', () => {
    const sim = new Simulation(fixture([{ id: 'bearer', name: 'Bearer', hp: 100, ward: WARD }]), TEST_RNG);
    const walker = sim.enemySystem.spawn('walker', 'main', 1);
    const bearer = sim.enemySystem.spawn('bearer', 'main', 1);
    for (let i = 0; i < 30; i++) sim.enemySystem.tick(SIM_DT);
    expect(walker.wardRemaining).toBeGreaterThan(0);
    // kill the bearer, outlast the last pulse's duration
    sim.enemySystem.applyDamage(bearer.id, 1000);
    for (let i = 0; i < Math.ceil((WARD.duration + 0.1) / SIM_DT); i++) sim.enemySystem.tick(SIM_DT);
    expect(walker.wardRemaining).toBe(0);
    sim.enemySystem.applyDamage(walker.id, 20);
    expect(walker.hp).toBe(80);
  });
});

describe('huntsHero (the Stalker)', () => {
  it('leaves the lane, closes on the hero, and holds the wave open', () => {
    const sim = new Simulation(fixture([{ id: 'shadow', name: 'Shadow', hp: 40, speed: 50, huntsHero: true }]), TEST_RNG);
    const shadow = sim.enemySystem.spawn('shadow', 'main', 1);
    const d0 = Math.hypot(sim.hero.x - shadow.x, sim.hero.y - shadow.y);
    sim.stalkers.tick(SIM_DT);
    expect(shadow.state).toBe('hunting');
    for (let i = 0; i < 60; i++) sim.stalkers.tick(SIM_DT);
    const d1 = Math.hypot(sim.hero.x - shadow.x, sim.hero.y - shadow.y);
    expect(d1).toBeLessThan(d0); // it is coming for you
    expect(shadow.distance).toBe(0); // and it is not using the road to do it
    expect(sim.enemySystem.walkingCount).toBeGreaterThan(0); // the wave waits
  });

  it('a dead hunter releases the wave', () => {
    const sim = new Simulation(fixture([{ id: 'shadow', name: 'Shadow', hp: 40, huntsHero: true }]), TEST_RNG);
    const shadow = sim.enemySystem.spawn('shadow', 'main', 1);
    sim.stalkers.tick(SIM_DT);
    expect(sim.enemySystem.walkingCount).toBe(1);
    sim.enemySystem.applyDamage(shadow.id, 1000);
    expect(sim.enemySystem.walkingCount).toBe(0);
  });
});
