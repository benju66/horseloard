import type { Economy } from '../data/schemas';

export interface CoinInstance {
  id: number;
  x: number;
  y: number;
  value: number;
  age: number;
  /** supply-drop chest: no magnet (ride onto it), own lifetime, ignores combat gating */
  isChest: boolean;
  lifetime: number;
}

/**
 * Gold + physical coins. Coins drop where enemies die, magnet to the hero,
 * and expire ONLY during combat; wave clear sweeps everything to the hero
 * (DESIGN §7). Pooled — coin volume spikes were the prototype's hot spot.
 */
export class EconomySystem {
  gold: number;
  readonly config: Economy;
  private readonly rng: () => number;
  private readonly live: CoinInstance[] = [];
  private readonly pool: CoinInstance[] = [];
  private nextId = 1;
  private sweepActive = false;

  readonly onCollect: Array<(value: number, x: number, y: number) => void> = [];

  constructor(config: Economy, rng: () => number = Math.random) {
    this.config = config;
    this.rng = rng;
    this.gold = config.startingGold;
  }

  spend(amount: number): boolean {
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }

  /** Drop coins on the ground, split into 1–2 scattered piles (prototype behavior). */
  spawnCoins(x: number, y: number, value: number): void {
    if (value <= 0) return;
    const piles = value > 6 ? 2 : 1;
    const per = Math.floor(value / piles);
    for (let k = 0; k < piles; k++) {
      const v = k === piles - 1 ? value - per * (piles - 1) : per;
      const c = this.pool.pop() ?? { id: 0, x: 0, y: 0, value: 0, age: 0, isChest: false, lifetime: 0 };
      c.id = this.nextId++;
      c.x = x + (this.rng() * 30 - 15);
      c.y = y + (this.rng() * 30 - 15);
      c.value = v;
      c.age = 0;
      c.isChest = false;
      c.lifetime = 0;
      this.live.push(c);
    }
  }

  /** A supply drop: free coins if you ride for it before it vanishes (DESIGN par.8). */
  spawnChest(x: number, y: number, value: number, lifetime: number): void {
    const c = this.pool.pop() ?? { id: 0, x: 0, y: 0, value: 0, age: 0, isChest: false, lifetime: 0 };
    c.id = this.nextId++;
    c.x = x;
    c.y = y;
    c.value = value;
    c.age = 0;
    c.isChest = true;
    c.lifetime = lifetime;
    this.live.push(c);
  }

  getCoin(id: number): CoinInstance | undefined {
    return this.live.find((c) => c.id === id);
  }

  removeCoin(id: number): boolean {
    const i = this.live.findIndex((c) => c.id === id);
    if (i < 0) return false;
    this.release(i, this.live[i]!);
    return true;
  }

  /** Wave clear: every ground coin flies to the hero until collected. */
  sweep(): void {
    if (this.live.length > 0) this.sweepActive = true;
  }

  tick(dt: number, heroX: number, heroY: number, inCombat: boolean): void {
    const { magnetRadius, collectRadius, expirySeconds, magnetSpeed } = this.config.coins;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i]!;
      if (c.isChest) {
        c.age += dt; // chests run out no matter the phase - ride NOW
        const dxc = heroX - c.x;
        const dyc = heroY - c.y;
        if (Math.hypot(dxc, dyc) < collectRadius + 8) {
          this.gold += c.value;
          for (const fn of this.onCollect) fn(c.value, c.x, c.y);
          this.release(i, c);
        } else if (c.age >= c.lifetime) {
          this.release(i, c);
        }
        continue;
      }
      if (inCombat && !this.sweepActive) {
        c.age += dt;
        if (c.age >= expirySeconds) {
          this.release(i, c);
          continue;
        }
      }
      const dx = heroX - c.x;
      const dy = heroY - c.y;
      const d = Math.hypot(dx, dy);
      if (this.sweepActive || d < magnetRadius) {
        const step = (magnetSpeed * dt) / Math.max(d, 1);
        c.x += dx * step;
        c.y += dy * step;
      }
      if (d < collectRadius) {
        this.gold += c.value;
        for (const fn of this.onCollect) fn(c.value, c.x, c.y);
        this.release(i, c);
      }
    }
    if (this.sweepActive && this.live.length === 0) this.sweepActive = false;
  }

  private release(index: number, c: CoinInstance): void {
    const last = this.live[this.live.length - 1]!;
    this.live[index] = last;
    this.live.pop();
    this.pool.push(c);
  }

  /** Ground coins, unordered. Do not mutate. */
  get coins(): readonly CoinInstance[] {
    return this.live;
  }
}
