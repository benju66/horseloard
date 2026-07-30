import { describe, expect, it } from 'vitest';
import { EconomySystem } from './economySystem';
import { TEST_ECONOMY, TEST_RNG } from './testFixtures';

const DT = 1 / 60;

function ticks(eco: EconomySystem, seconds: number, heroX: number, heroY: number, inCombat: boolean): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) eco.tick(DT, heroX, heroY, inCombat);
}

describe('coins', () => {
  it('splits big drops into two piles that sum to the value', () => {
    const eco = new EconomySystem(TEST_ECONOMY, TEST_RNG);
    eco.spawnCoins(0, 0, 4);
    expect(eco.coins).toHaveLength(1);
    eco.spawnCoins(0, 0, 11);
    expect(eco.coins).toHaveLength(3);
    expect(eco.coins.reduce((s, c) => s + c.value, 0)).toBe(15);
  });

  it('magnets to the hero inside the radius and collects into gold', () => {
    const eco = new EconomySystem(TEST_ECONOMY, TEST_RNG);
    eco.spawnCoins(100, 100, 5); // hero 50 away — inside magnetRadius 80
    ticks(eco, 0.5, 150, 100, true);
    expect(eco.coins).toHaveLength(0);
    expect(eco.gold).toBe(TEST_ECONOMY.startingGold + 5);
  });

  it('ignores coins outside the magnet radius', () => {
    const eco = new EconomySystem(TEST_ECONOMY, TEST_RNG);
    eco.spawnCoins(0, 0, 5); // hero 200 away
    ticks(eco, 1, 200, 0, false);
    expect(eco.coins).toHaveLength(1);
    expect(eco.coins[0]!.x).toBe(0);
  });

  it('expires coins only during combat', () => {
    const eco = new EconomySystem(TEST_ECONOMY, TEST_RNG);
    eco.spawnCoins(0, 0, 5);
    ticks(eco, TEST_ECONOMY.coins.expirySeconds + 1, 500, 500, false); // build phase: never expires
    expect(eco.coins).toHaveLength(1);
    ticks(eco, TEST_ECONOMY.coins.expirySeconds + 1, 500, 500, true); // combat: gone
    expect(eco.coins).toHaveLength(0);
    expect(eco.gold).toBe(TEST_ECONOMY.startingGold);
  });

  it('sweep pulls every coin to the hero regardless of distance', () => {
    const eco = new EconomySystem(TEST_ECONOMY, TEST_RNG);
    eco.spawnCoins(0, 0, 3);
    eco.spawnCoins(400, 700, 3);
    eco.sweep();
    ticks(eco, 4, 200, 350, false); // farthest coin is ~400 units; 260 u/s
    expect(eco.coins).toHaveLength(0);
    expect(eco.gold).toBe(TEST_ECONOMY.startingGold + 6);
  });

  it('sweeping coins do not expire mid-flight', () => {
    const eco = new EconomySystem(TEST_ECONOMY, TEST_RNG);
    eco.spawnCoins(0, 0, 3);
    ticks(eco, TEST_ECONOMY.coins.expirySeconds - 1, 500, 500, true); // almost expired
    eco.sweep();
    ticks(eco, 3, 500, 500, true);
    expect(eco.gold).toBe(TEST_ECONOMY.startingGold + 3);
  });
});

describe('gold', () => {
  it('spend enforces the balance', () => {
    const eco = new EconomySystem(TEST_ECONOMY, TEST_RNG); // 45
    expect(eco.spend(30)).toBe(true);
    expect(eco.gold).toBe(15);
    expect(eco.spend(16)).toBe(false);
    expect(eco.gold).toBe(15);
    expect(eco.spend(15)).toBe(true);
    expect(eco.gold).toBe(0);
  });
});
