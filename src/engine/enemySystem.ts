import type { Enemy } from '../data/schemas';
import type { IdGenerator } from './ids';
import type { LanePath } from './path';

/**
 * 'walking'  — advancing along its lane
 * 'at-end'   — reached the path end. Leaks never despawn (DESIGN §6);
 *              M0.6 turns this into the besieger state machine.
 */
export type EnemyState = 'walking' | 'at-end';

export interface EnemyInstance {
  readonly id: number;
  readonly config: Enemy;
  readonly laneId: string;
  readonly maxHp: number;
  hp: number;
  distance: number;
  state: EnemyState;
  /** world position, refreshed every tick from the lane path (no per-tick allocation) */
  x: number;
  y: number;
}

/**
 * Owns all live enemies. Generic over the roster — configs come in as
 * validated schema data; nothing here knows any enemy by name.
 */
export class EnemySystem {
  private readonly configs: Map<string, Enemy>;
  private readonly lanes: Map<string, LanePath>;
  private readonly ids: IdGenerator;
  private readonly list: EnemyInstance[] = [];
  private readonly byId = new Map<number, EnemyInstance>();

  /** Listener arrays — the sim and the renderer both subscribe. */
  readonly onSpawn: Array<(e: EnemyInstance) => void> = [];
  readonly onDeath: Array<(e: EnemyInstance) => void> = [];
  readonly onReachEnd: Array<(e: EnemyInstance) => void> = [];
  readonly onDamaged: Array<(e: EnemyInstance, amount: number) => void> = [];

  constructor(configs: readonly Enemy[], lanes: Map<string, LanePath>, ids: IdGenerator) {
    this.configs = new Map(configs.map((c) => [c.id, c]));
    this.lanes = lanes;
    this.ids = ids;
  }

  spawn(enemyId: string, laneId: string, hpMultiplier: number): EnemyInstance {
    const config = this.configs.get(enemyId);
    if (!config) throw new Error(`EnemySystem: unknown enemy config "${enemyId}"`);
    const lane = this.lanes.get(laneId);
    if (!lane) throw new Error(`EnemySystem: unknown lane "${laneId}"`);

    const maxHp = Math.round(config.hp * hpMultiplier);
    const e: EnemyInstance = {
      id: this.ids.allocate(),
      config,
      laneId,
      maxHp,
      hp: maxHp,
      distance: 0,
      state: 'walking',
      x: 0,
      y: 0,
    };
    lane.positionAt(0, e);
    this.list.push(e);
    this.byId.set(e.id, e);
    for (const fn of this.onSpawn) fn(e);
    return e;
  }

  tick(dt: number): void {
    for (const e of this.list) {
      if (e.state !== 'walking') continue;
      const lane = this.lanes.get(e.laneId)!;
      e.distance += e.config.speed * dt;
      if (e.distance >= lane.totalLength) {
        e.distance = lane.totalLength;
        e.state = 'at-end';
        lane.positionAt(e.distance, e);
        for (const fn of this.onReachEnd) fn(e);
      } else {
        lane.positionAt(e.distance, e);
      }
    }
  }

  /** Returns true if the hit was lethal. Dead enemies are removed immediately. */
  applyDamage(id: number, amount: number): boolean {
    const e = this.byId.get(id);
    if (!e) return false;
    e.hp -= amount;
    for (const fn of this.onDamaged) fn(e, amount);
    if (e.hp > 0) return false;
    e.hp = 0;
    this.remove(e);
    for (const fn of this.onDeath) fn(e);
    return true;
  }

  private remove(e: EnemyInstance): void {
    const i = this.list.indexOf(e);
    if (i >= 0) {
      const last = this.list[this.list.length - 1]!;
      this.list[i] = last;
      this.list.pop();
    }
    this.byId.delete(e.id);
  }

  getById(id: number): EnemyInstance | undefined {
    return this.byId.get(id);
  }

  /** Live enemies, unordered (swap-remove). Do not mutate. */
  get enemies(): readonly EnemyInstance[] {
    return this.list;
  }

  get aliveCount(): number {
    return this.list.length;
  }

  get walkingCount(): number {
    let n = 0;
    for (const e of this.list) if (e.state === 'walking') n++;
    return n;
  }
}
