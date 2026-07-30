import type { EconomySystem } from './economySystem';
import type { EnemyInstance, EnemySystem } from './enemySystem';
import type { LanePath, MutableVec2 } from './path';

type LootMode = 'to-coin' | 'to-path' | 'flee';

interface LootState {
  mode: LootMode;
  targetCoinId: number;
  savedDistance: number;
  carried: number;
}

const GRAB_RADIUS = 14;

/**
 * Drives enemies with the lootsCoins trait: break off the lane for ground
 * coins, then flee back up the lane with the haul. Killing one drops
 * everything it carried; letting one out is your gold gone — the roster's
 * anti-greed enforcer (DESIGN §6).
 */
export class LooterSystem {
  private readonly enemies: EnemySystem;
  private readonly economy: EconomySystem;
  private readonly lanes: Map<string, LanePath>;
  private readonly states = new Map<number, LootState>();
  private readonly tmp: MutableVec2 = { x: 0, y: 0 };

  readonly onEscape: Array<(e: EnemyInstance, carried: number) => void> = [];

  constructor(enemies: EnemySystem, economy: EconomySystem, lanes: Map<string, LanePath>) {
    this.enemies = enemies;
    this.economy = economy;
    this.lanes = lanes;

    enemies.onDeath.push((e) => {
      const st = this.states.get(e.id);
      if (st) {
        if (st.carried > 0) economy.spawnCoins(e.x, e.y, st.carried); // drop the haul
        this.states.delete(e.id);
      }
    });
  }

  tick(dt: number): void {
    for (const e of this.enemies.enemies) {
      const cfg = e.config.lootsCoins;
      if (!cfg) continue;
      const st = this.states.get(e.id);

      if (!st) {
        if (e.state !== 'walking') continue;
        const coin = this.nearestCoin(e.x, e.y, cfg.detectRadius);
        if (coin !== null) {
          this.states.set(e.id, {
            mode: 'to-coin',
            targetCoinId: coin,
            savedDistance: e.distance,
            carried: 0,
          });
          e.state = 'looting';
        }
        continue;
      }

      const speed = this.enemies.effectiveSpeed(e) * (st.mode === 'to-coin' ? 1 : cfg.fleeSpeedMultiplier);
      const lane = this.lanes.get(e.laneId)!;

      if (st.mode === 'to-coin') {
        const coin = this.economy.getCoin(st.targetCoinId);
        if (!coin) {
          st.mode = 'to-path'; // it vanished — head back
        } else if (this.moveToward(e, coin.x, coin.y, speed * dt, GRAB_RADIUS)) {
          st.carried += coin.value;
          this.economy.removeCoin(coin.id);
          st.mode = 'to-path';
        }
      } else if (st.mode === 'to-path') {
        lane.positionAt(st.savedDistance, this.tmp);
        if (this.moveToward(e, this.tmp.x, this.tmp.y, speed * dt, 3)) {
          e.distance = st.savedDistance;
          if (st.carried > 0) {
            st.mode = 'flee';
          } else {
            e.state = 'walking'; // empty-handed — back to the war
            this.states.delete(e.id);
          }
        }
      } else {
        // flee: run back up the lane with the haul
        e.distance -= speed * dt;
        if (e.distance <= 0) {
          const carried = st.carried;
          this.states.delete(e.id);
          this.enemies.despawn(e.id); // gone, and so is your gold
          for (const fn of this.onEscape) fn(e, carried);
          continue;
        }
        lane.positionAt(e.distance, e);
        const dir = lane.directionAt(e.distance, this.tmp);
        e.facingX = -dir.x;
        e.facingY = -dir.y;
      }
    }
  }

  /** Carried gold for the HUD/renderer (0 if not carrying). */
  carriedBy(enemyId: number): number {
    return this.states.get(enemyId)?.carried ?? 0;
  }

  private nearestCoin(x: number, y: number, radius: number): number | null {
    let best: number | null = null;
    let bestSq = radius * radius;
    for (const c of this.economy.coins) {
      const dx = c.x - x;
      const dy = c.y - y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestSq) {
        bestSq = dSq;
        best = c.id;
      }
    }
    return best;
  }

  private moveToward(e: EnemyInstance, tx: number, ty: number, step: number, arrive: number): boolean {
    const dx = tx - e.x;
    const dy = ty - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= Math.max(step, arrive)) {
      e.x = tx;
      e.y = ty;
      return true;
    }
    e.facingX = dx / dist;
    e.facingY = dy / dist;
    e.x += e.facingX * step;
    e.y += e.facingY * step;
    return false;
  }
}
