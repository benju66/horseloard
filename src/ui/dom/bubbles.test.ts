import { describe, expect, it } from 'vitest';
import { Simulation, type SimData } from '../../engine/simulation';
import {
  TEST_ECONOMY,
  TEST_HERO,
  TEST_RNG,
  makeEnemy,
  makeMap,
  makeTowersFile,
} from '../../engine/testFixtures';
import type { EnemiesFile, WaveSet } from '../../data/schemas';
import { bubbleActions } from './bubbles';

/**
 * DESIGN §9's contextual-bubble rule is a *feel* invariant: ride close → bubble
 * → tap, and the nearest interactive thing wins. The reach constants were tuned
 * in the prototype and re-validated in the Phaser build, so silent drift here
 * would degrade the thing that makes the UI need zero literacy.
 *
 * `bubbleActions` is pure — no DOM — precisely so this can be guarded.
 */

/**
 * The shared fixture puts its forge 42 units from its only plot, so the plot can
 * never win the nearest-thing check — fine for engine tests, useless for testing
 * reach. This map spaces the three interactives far enough apart that each one's
 * reach can be probed in isolation.
 */
const map = {
  ...makeMap(),
  plots: [{ id: 'p1', position: { x: 50, y: 100 } }],
  forge: { position: { x: 50, y: 10 } },
  gate: { ...makeMap().gate, position: { x: 50, y: 190 } },
};

function fixture(): SimData {
  const enemies: EnemiesFile = {
    elite: { chance: 0, hpMultiplier: 2, coinMultiplier: 2 },
    enemies: [makeEnemy({ id: 'walker', name: 'Walker' })],
  };
  const waveSet: WaveSet = {
    mapId: map.id,
    waves: [
      { hpMultiplier: 1, entries: [{ enemyId: 'walker', count: 1, spacing: 1, laneId: 'main', delay: 0 }] },
    ],
  };
  return { enemies, map, waveSet, hero: TEST_HERO, economy: TEST_ECONOMY, towers: makeTowersFile() };
}

function simAt(x: number, y: number): Simulation {
  const sim = new Simulation(fixture(), TEST_RNG);
  sim.hero.x = x;
  sim.hero.y = y;
  return sim;
}

describe('contextual bubbles', () => {
  const plot = map.plots[0]!;

  it('shows nothing when the hero is nowhere near anything', () => {
    // (5,55) clears all three reaches: 63.6 from plot and forge, 142 from gate.
    const sim = simAt(5, 55);
    expect(bubbleActions(sim, map)).toEqual([]);
  });

  it('offers every tower on an empty plot when the hero rides onto it', () => {
    const sim = simAt(plot.position.x, plot.position.y);
    const actions = bubbleActions(sim, map);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.title.startsWith('Build'))).toBe(true);
  });

  it('gates affordability rather than hiding the option', () => {
    // Seeing a thing you cannot yet afford is how the player learns it exists.
    const sim = simAt(plot.position.x, plot.position.y);
    sim.economy.gold = 0;
    const actions = bubbleActions(sim, map);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => !a.enabled)).toBe(true);
  });

  it('stops offering the plot once the hero rides out of its reach', () => {
    // 52 units is the tuned reach. Just inside offers the plot; just outside
    // must not — though something *else* may legitimately take over, since the
    // nearest interactive thing wins.
    const inside = bubbleActions(simAt(plot.position.x + 51, plot.position.y), map);
    expect(inside.some((a) => a.title.startsWith('Build'))).toBe(true);

    const outside = bubbleActions(simAt(plot.position.x + 53, plot.position.y), map);
    expect(outside.some((a) => a.title.startsWith('Build'))).toBe(false);
  });

  it('switches from build to upgrade/sell once a tower stands there', () => {
    const sim = simAt(plot.position.x, plot.position.y);
    const towerId = sim.towerSystem.roster[0]!.id;
    sim.economy.gold = 999;
    expect(sim.buildTower(plot.id, towerId)).toBe(true);
    const titles = bubbleActions(sim, map).map((a) => a.title);
    expect(titles.some((t) => t.startsWith('Upgrade'))).toBe(true);
    expect(titles).toContain('Sell');
    expect(titles.some((t) => t.startsWith('Build'))).toBe(false);
  });

  it('offers the forge when the hero is closest to it', () => {
    const sim = simAt(map.forge.position.x, map.forge.position.y);
    const actions = bubbleActions(sim, map);
    expect(actions.length).toBe(1);
    expect(actions[0]!.title).toMatch(/^Bow Lv/);
  });

  it('never offers more than the bubble pool can show', () => {
    const sim = simAt(plot.position.x, plot.position.y);
    expect(bubbleActions(sim, map).length).toBeLessThanOrEqual(4);
  });
});
