import type { Gate } from '../data/schemas';
import type { EnemyInstance, EnemySystem } from './enemySystem';

const SLOT_SPACING = 16;
const SLOT_ROW_OFFSET = 34; // attack row sits this far up-path of the gate
const QUEUE_SPACING = 18;
const QUEUE_ROW_OFFSET = 56; // overflow mob gathers behind the attackers

interface Assignment {
  kind: 'slot' | 'queue';
  index: number;
}

/**
 * Leaks don't despawn — they siege (DESIGN §6). A capped row of attackers
 * batters the gate with per-type DPS; overflow queues behind and promotes
 * as attackers die. Repair is a coin sink; damage TAKEN is tracked forever
 * because stars score on it (repair must never buy stars back).
 */
export class GateSystem {
  hp: number;
  /**
   * Not `readonly`: an in-run draft can reinforce the gate. Everywhere else
   * this is still write-once — `reinforce()` is the only sanctioned mutation,
   * and it exists because this is the one balance number a system *copies* at
   * construction rather than reading live from its config.
   */
  maxHp: number;
  /** cumulative damage received this run — repairs do not reduce it */
  totalDamageTaken = 0;

  private readonly enemies: EnemySystem;
  private readonly slots: Array<number | null>;
  private readonly queue: number[] = [];
  private readonly assignments = new Map<number, Assignment>();
  private readonly gateX: number;
  private readonly gateY: number;
  private destroyed = false;

  readonly onDestroyed: Array<() => void> = [];

  constructor(gate: Gate, enemies: EnemySystem) {
    this.hp = gate.hp;
    this.maxHp = gate.hp;
    this.gateX = gate.position.x;
    this.gateY = gate.position.y;
    this.slots = new Array<number | null>(gate.attackSlots).fill(null);
    this.enemies = enemies;

    enemies.onReachEnd.push((e) => this.admit(e));
    enemies.onDeath.push((e) => this.discharge(e.id));
  }

  get besiegerCount(): number {
    let n = 0;
    for (const id of this.slots) if (id !== null) n++;
    return n;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  /** A walker reached the path end: give it an attack slot, or queue it behind. */
  private admit(e: EnemyInstance): void {
    const free = this.slots.indexOf(null);
    if (free >= 0) {
      this.slots[free] = e.id;
      this.assignments.set(e.id, { kind: 'slot', index: free });
      this.moveTo(e, 'slot', free);
    } else {
      this.queue.push(e.id);
      this.assignments.set(e.id, { kind: 'queue', index: this.queue.length - 1 });
      this.moveTo(e, 'queue', this.queue.length - 1);
    }
  }

  /** An enemy died: free its spot; the head of the queue takes any freed slot. */
  private discharge(enemyId: number): void {
    const assignment = this.assignments.get(enemyId);
    if (!assignment) return;
    this.assignments.delete(enemyId);

    if (assignment.kind === 'slot') {
      this.slots[assignment.index] = null;
      const nextId = this.queue.shift();
      if (nextId !== undefined) {
        this.slots[assignment.index] = nextId;
        this.assignments.set(nextId, { kind: 'slot', index: assignment.index });
        const next = this.enemies.getById(nextId);
        if (next) this.moveTo(next, 'slot', assignment.index);
        this.reindexQueue();
      }
    } else {
      this.queue.splice(assignment.index, 1);
      this.reindexQueue();
    }
  }

  private reindexQueue(): void {
    this.queue.forEach((id, i) => {
      this.assignments.set(id, { kind: 'queue', index: i });
      const e = this.enemies.getById(id);
      if (e) this.moveTo(e, 'queue', i);
    });
  }

  private moveTo(e: EnemyInstance, kind: 'slot' | 'queue', index: number): void {
    if (kind === 'slot') {
      const n = this.slots.length;
      e.slotX = this.gateX + (index - (n - 1) / 2) * SLOT_SPACING;
      e.slotY = this.gateY - SLOT_ROW_OFFSET;
    } else {
      e.slotX = this.gateX + (index - 2) * QUEUE_SPACING;
      e.slotY = this.gateY - QUEUE_ROW_OFFSET;
    }
    if (e.state === 'at-slot') e.state = 'to-slot'; // reposition: walk to the new spot
  }

  /** Attackers in position batter the gate. Queue members just loom. */
  tick(dt: number): void {
    if (this.destroyed) return;
    for (const id of this.slots) {
      if (id === null) continue;
      const e = this.enemies.getById(id);
      if (!e || e.state !== 'at-slot') continue;
      const damage = Math.min(e.config.siegeDps * dt, this.hp); // can't take more than it has
      this.hp -= damage;
      this.totalDamageTaken += damage;
      if (this.hp <= 0) break;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.destroyed = true;
      for (const fn of this.onDestroyed) fn();
    }
  }

  /**
   * Raise maximum capacity and grant the same amount as current HP.
   *
   * Granting the HP matters: a reinforcement that only raised the ceiling would
   * read as *nothing happening* on a gate that is already damaged, which is the
   * exact moment a player would choose it. It is not a repair — `totalDamageTaken`
   * is untouched, so this cannot buy back stars (DESIGN: stars score on damage
   * taken, never on HP remaining).
   */
  reinforce(amount: number): void {
    if (amount <= 0 || this.destroyed) return;
    this.maxHp += amount;
    this.hp += amount;
  }

  /** Restore HP (already paid for). Returns the amount actually restored. */
  repair(amount: number): number {
    const restored = Math.min(amount, this.maxHp - this.hp);
    this.hp += restored;
    return restored;
  }
}
