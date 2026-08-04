import type { EnemyInstance, EnemySystem } from './enemySystem';

/**
 * Drives enemies with the huntsHero trait (BIOMES.md Part K.3): leave the
 * lane and come for the commander. The hero cannot die, so the price is
 * control — a hunter carries staggersHero and collects it on contact, again
 * and again, while you are trying to be somewhere else.
 *
 * This is the one pressure that makes mobility a *requirement* rather than a
 * convenience: towers only help if you fight where they are, which turns
 * "where do I stand" from a habit into a decision.
 *
 * A hunter never sieges and never arrives; it holds the wave open until it
 * dies (walkingCount counts 'hunting'). That is deliberate — an enemy you can
 * simply ride away from forever would be no pressure at all.
 */
export class StalkerSystem {
  private readonly enemies: EnemySystem;
  private readonly hero: { x: number; y: number };

  constructor(enemies: EnemySystem, hero: { x: number; y: number }) {
    this.enemies = enemies;
    this.hero = hero;
  }

  tick(dt: number): void {
    for (const e of this.enemies.enemies) {
      if (!e.config.huntsHero) continue;
      if (e.state === 'walking') e.state = 'hunting';
      if (e.state !== 'hunting') continue;
      this.moveToward(e, this.hero.x, this.hero.y, this.enemies.effectiveSpeed(e) * dt);
    }
  }

  private moveToward(e: EnemyInstance, tx: number, ty: number, step: number): void {
    const dx = tx - e.x;
    const dy = ty - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) return;
    const move = Math.min(step, dist);
    e.x += (dx / dist) * move;
    e.y += (dy / dist) * move;
    e.facingX = dx / dist;
    e.facingY = dy / dist;
  }
}
