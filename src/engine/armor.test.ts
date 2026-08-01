import { describe, expect, it } from 'vitest';
import { EnemySystem } from './enemySystem';
import { IdGenerator } from './ids';
import { buildLanePaths } from './path';
import { makeEnemy, makeMap } from './testFixtures';

/**
 * Armor and damage types (DESIGN §6 option A).
 *
 * Armor reduces damage unless the source declares `ignoresArmor`. Explosive and
 * magic bypass it; physical does not. That asymmetry is the whole mechanic —
 * an armored enemy is an Archer counter that, unlike the Shieldbearer's block,
 * does not depend on where you stand.
 *
 * The stacking order matters and is easy to get wrong: armor applies *before*
 * the facing block, so an armored shieldbearer hit from the front takes both
 * reductions multiplicatively rather than one masking the other.
 */

function systemWith(overrides: Parameters<typeof makeEnemy>[0]) {
  const map = makeMap();
  // Straight to EnemySystem rather than through a Simulation: applyDamage is
  // the unit under test, and a full sim would let towers and the hero add
  // damage of their own.
  const enemies = new EnemySystem(
    [makeEnemy(overrides)],
    buildLanePaths(map),
    new IdGenerator(),
    null,
    () => 0.5,
  );
  enemies.spawn(overrides.id, map.lanes[0]!.id, 1);
  return { enemies, enemy: enemies.enemies[0]! };
}

describe('armor', () => {
  it('reduces physical damage by its fraction', () => {
    const { enemies, enemy } = systemWith({ id: 'armored', hp: 1000, armor: 0.25 });
    enemies.applyDamage(enemy.id, 100);
    expect(1000 - enemy.hp).toBeCloseTo(75, 5);
  });

  it('does not touch damage that ignores it', () => {
    const { enemies, enemy } = systemWith({ id: 'armored', hp: 1000, armor: 0.25 });
    enemies.applyDamage(enemy.id, 100, undefined, undefined, true);
    expect(1000 - enemy.hp).toBeCloseTo(100, 5);
  });

  it('is a no-op at zero, which is the default for the whole roster', () => {
    const { enemies, enemy } = systemWith({ id: 'plain', hp: 1000 });
    expect(enemy.config.armor).toBe(0);
    enemies.applyDamage(enemy.id, 100);
    expect(1000 - enemy.hp).toBeCloseTo(100, 5);
  });

  it('stacks multiplicatively with the frontal block, not exclusively', () => {
    // Facing +y by default; a source ahead of it is inside the arc.
    const { enemies, enemy } = systemWith({
      id: 'armored-shield',
      hp: 10000,
      armor: 0.5,
      frontalBlock: { arcDegrees: 180, multiplier: 0.2 },
    });
    enemy.facingX = 0;
    enemy.facingY = 1;
    enemies.applyDamage(enemy.id, 100, enemy.x, enemy.y + 50);
    // 100 → armor 0.5 → 50 → block 0.2 → 10. Either alone would leave 50 or 20.
    expect(10000 - enemy.hp).toBeCloseTo(10, 5);
  });

  it('a hit from behind takes armor but not the block', () => {
    const { enemies, enemy } = systemWith({
      id: 'armored-shield',
      hp: 10000,
      armor: 0.5,
      frontalBlock: { arcDegrees: 180, multiplier: 0.2 },
    });
    enemy.facingX = 0;
    enemy.facingY = 1;
    enemies.applyDamage(enemy.id, 100, enemy.x, enemy.y - 50);
    expect(10000 - enemy.hp).toBeCloseTo(50, 5);
  });
});
