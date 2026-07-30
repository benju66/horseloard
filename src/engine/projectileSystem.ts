import type { EnemySystem } from './enemySystem';

/** Distance at which an arrow counts as connecting, on top of one tick's travel. */
const HIT_SLOP = 6;

export interface ProjectileInstance {
  id: number;
  x: number;
  y: number;
  /** normalized flight direction, for rendering */
  dirX: number;
  dirY: number;
  targetId: number;
  /** last known target position — flown to if the target dies mid-flight */
  targetX: number;
  targetY: number;
  damage: number;
  speed: number;
  fromHero: boolean;
}

/**
 * Homing projectiles, pooled — spawn/despawn recycles instances so waves of
 * arrows never allocate per shot (CLAUDE.md #5). Prototype behavior: track a
 * live target; if it dies mid-flight, finish the flight to its last position.
 */
export class ProjectileSystem {
  private readonly enemies: EnemySystem;
  private readonly live: ProjectileInstance[] = [];
  private readonly pool: ProjectileInstance[] = [];
  private nextId = 1;

  readonly onSpawn: Array<(p: ProjectileInstance) => void> = [];
  readonly onDespawn: Array<(p: ProjectileInstance) => void> = [];

  constructor(enemies: EnemySystem) {
    this.enemies = enemies;
  }

  spawn(x: number, y: number, targetId: number, damage: number, speed: number, fromHero: boolean): void {
    const target = this.enemies.getById(targetId);
    if (!target) return;
    const p = this.pool.pop() ?? {
      id: 0,
      x: 0,
      y: 0,
      dirX: 0,
      dirY: 1,
      targetId: 0,
      targetX: 0,
      targetY: 0,
      damage: 0,
      speed: 0,
      fromHero: false,
    };
    p.id = this.nextId++;
    p.x = x;
    p.y = y;
    p.targetId = targetId;
    p.targetX = target.x;
    p.targetY = target.y;
    p.damage = damage;
    p.speed = speed;
    p.fromHero = fromHero;
    this.live.push(p);
    for (const fn of this.onSpawn) fn(p);
  }

  tick(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      const target = this.enemies.getById(p.targetId);
      if (target) {
        p.targetX = target.x;
        p.targetY = target.y;
      }
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step + HIT_SLOP) {
        if (target) this.enemies.applyDamage(target.id, p.damage);
        this.release(i, p);
      } else {
        p.dirX = dx / dist;
        p.dirY = dy / dist;
        p.x += p.dirX * step;
        p.y += p.dirY * step;
      }
    }
  }

  private release(index: number, p: ProjectileInstance): void {
    const last = this.live[this.live.length - 1]!;
    this.live[index] = last;
    this.live.pop();
    this.pool.push(p);
    for (const fn of this.onDespawn) fn(p);
  }

  /** Live projectiles, unordered. Do not mutate. */
  get projectiles(): readonly ProjectileInstance[] {
    return this.live;
  }

  get liveCount(): number {
    return this.live.length;
  }
}
