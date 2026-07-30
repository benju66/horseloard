import type { Ability } from '../data/schemas';
import type { EnemySystem } from './enemySystem';
import type { HeroSystem } from './heroSystem';
import type { TowerSystem } from './towerSystem';

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
  private readonly aoeScratch: number[] = [];

  readonly onCast: Array<(ability: Ability) => void> = [];

  constructor(
    abilities: readonly Ability[],
    extraUnlockedIds: readonly string[],
    enemies: EnemySystem,
    hero: HeroSystem,
    towers: TowerSystem,
  ) {
    for (const ability of abilities) {
      this.slots.push({
        ability,
        unlocked: ability.unlockedByDefault || extraUnlockedIds.includes(ability.id),
        cooldownRemaining: 0,
      });
    }
    this.enemies = enemies;
    this.hero = hero;
    this.towers = towers;
  }

  getSlot(abilityId: string): AbilitySlot | undefined {
    return this.slots.find((s) => s.ability.id === abilityId);
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
      case 'charge':
        this.hero.activateCharge(effect);
        break;
    }

    slot.cooldownRemaining = slot.ability.cooldown;
    for (const fn of this.onCast) fn(slot.ability);
    return true;
  }
}
