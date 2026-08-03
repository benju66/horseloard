import type { Ability } from '../data/schemas';
import type { EnemySystem } from './enemySystem';
import type { HeroSystem } from './heroSystem';
import type { TowerSystem } from './towerSystem';
import type { ZoneSystem } from './zoneSystem';
import type { ArmySystem } from './armySystem';

export interface AbilitySlot {
  readonly ability: Ability;
  unlocked: boolean;
  cooldownRemaining: number;
}

/**
 * The right-thumb layer: up to three abilities, all cast at/from the hero
 * position — no global tap-anywhere targeting (DESIGN §4). Unlocks come
 * from unlockedByDefault + flags (the meta tree takes over in M3).
 */
export class AbilitySystem {
  readonly slots: AbilitySlot[] = [];
  private readonly enemies: EnemySystem;
  private readonly hero: HeroSystem;
  private readonly towers: TowerSystem;
  private readonly zones: ZoneSystem;
  private readonly army: ArmySystem;
  private readonly aoeScratch: number[] = [];
  /**
   * How many abilities may be carried at once (abilities.json `equipSlots`).
   * The structural cap on the hero's damage-per-minute — see the schema.
   */
  readonly equipSlots: number;

  readonly onCast: Array<(ability: Ability) => void> = [];

  constructor(
    abilities: readonly Ability[],
    extraUnlockedIds: readonly string[],
    enemies: EnemySystem,
    hero: HeroSystem,
    towers: TowerSystem,
    zones: ZoneSystem,
    army: ArmySystem,
    equipSlots = 3,
  ) {
    this.equipSlots = equipSlots;
    for (const ability of abilities) {
      // Defaults and meta-tree grants fill slots in roster order and stop at
      // the cap, rather than the cap being enforced only on drafted unlocks —
      // otherwise a player who bought four tree nodes would carry four.
      const wants = ability.unlockedByDefault || extraUnlockedIds.includes(ability.id);
      this.slots.push({
        ability,
        unlocked: wants && this.slots.filter((s) => s.unlocked).length < equipSlots,
        cooldownRemaining: 0,
      });
    }
    this.enemies = enemies;
    this.hero = hero;
    this.towers = towers;
    this.zones = zones;
    this.army = army;
  }

  getSlot(abilityId: string): AbilitySlot | undefined {
    return this.slots.find((s) => s.ability.id === abilityId);
  }

  /** How many of the equip slots are currently filled. */
  get equippedCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.unlocked) n++;
    return n;
  }

  /** True when there is room to carry another ability. */
  get hasFreeSlot(): boolean {
    return this.equippedCount < this.equipSlots;
  }

  /**
   * Make an ability available mid-run. Returns false for an unknown id so a
   * typo in the data fails visibly at the call site rather than silently
   * granting nothing, and false when the bar is full — the cap is the hero's
   * damage ceiling and nothing may quietly step over it.
   *
   * Ready immediately rather than starting on cooldown: the draft is the
   * reward, and handing over a card you cannot use for 16 seconds reads as the
   * pick having done nothing.
   */
  unlock(abilityId: string): boolean {
    const slot = this.getSlot(abilityId);
    if (!slot) return false;
    if (slot.unlocked) return false; // already carried; the card bought nothing
    if (!this.hasFreeSlot) return false;
    slot.unlocked = true;
    slot.cooldownRemaining = 0;
    return true;
  }

  tick(dt: number): void {
    for (const slot of this.slots) {
      if (slot.cooldownRemaining > 0) {
        slot.cooldownRemaining -= dt;
        if (slot.cooldownRemaining < 1e-9) slot.cooldownRemaining = 0;
      }
    }
  }

  /** Returns false when locked or cooling down. */
  cast(abilityId: string): boolean {
    const slot = this.getSlot(abilityId);
    if (!slot || !slot.unlocked || slot.cooldownRemaining > 0) return false;

    const effect = slot.ability.effect;
    switch (effect.type) {
      case 'aoe-damage': {
        // Volley: arrow rain centered on the hero.
        const hits = this.aoeScratch;
        hits.length = 0;
        const rSq = effect.radius * effect.radius;
        for (const e of this.enemies.enemies) {
          const dx = e.x - this.hero.x;
          const dy = e.y - this.hero.y;
          if (dx * dx + dy * dy <= rSq) hits.push(e.id);
        }
        for (const id of hits) this.enemies.applyDamage(id, effect.damage); // rain falls on shields too
        break;
      }
      case 'tower-rate-buff':
        this.towers.applyRateBuff(effect.rateMultiplier, effect.duration);
        break;
      case 'hero-buff':
        this.hero.applyBuff(effect.stat, effect.multiplier, effect.duration);
        break;
      case 'pierce-shot': {
        // A corridor from the hero along its facing. Measured against the
        // *segment*, not an infinite line, so a shot aimed forward never hits
        // what is behind you.
        //
        // Ignores armour, like the hero's ordinary arrows — DESIGN §6 records
        // that decision as the one that made armour work at all, because armour
        // on the player's baseline damage is a flat tax on every build rather
        // than a lever on tower choice. Facing still applies: the source
        // position is passed, so a shieldbearer met head-on still blocks, and
        // flanking it stays a positioning decision.
        const hits = this.aoeScratch;
        hits.length = 0;
        const hx = this.hero.headingX;
        const hy = this.hero.headingY;
        const len = Math.hypot(hx, hy) || 1;
        const dirX = hx / len;
        const dirY = hy / len;
        for (const e of this.enemies.enemies) {
          const relX = e.x - this.hero.x;
          const relY = e.y - this.hero.y;
          const along = relX * dirX + relY * dirY;
          if (along < 0 || along > effect.range) continue;
          const across = Math.abs(relX * dirY - relY * dirX);
          if (across <= effect.halfWidth + e.config.radius) hits.push(e.id);
        }
        for (const id of hits) {
          this.enemies.applyDamage(id, effect.damage, this.hero.x, this.hero.y, true);
        }
        break;
      }
      case 'summon-host':
        // Posted on the road nearest the hero, not around the hero — a host
        // mustered in a field blocks nothing, so where you ride is the decision.
        this.army.muster(this.hero.x, this.hero.y, effect);
        break;
      case 'ground-zone':
        // Dropped at the hero's feet — ride to where they will be, not where
        // they are. The ZoneSystem owns its lifetime from here.
        this.zones.spawn(this.hero.x, this.hero.y, effect);
        break;
      case 'charge':
        this.hero.activateCharge(effect);
        break;
    }

    slot.cooldownRemaining = slot.ability.cooldown;
    for (const fn of this.onCast) fn(slot.ability);
    return true;
  }
}
