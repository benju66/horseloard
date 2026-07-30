import Phaser from 'phaser';
import type { AbilitySlot } from '../engine/abilitySystem';

const BUTTON_RADIUS = 26;
/** Bottom-right arc, right-thumb reach (DESIGN §9). */
const POSITIONS: Array<{ x: number; y: number }> = [
  { x: 376, y: 586 },
  { x: 344, y: 652 },
  { x: 376, y: 718 },
];

interface ButtonView {
  slot: AbilitySlot;
  bg: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  sweep: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
}

/**
 * Up to three ability buttons with cooldown sweeps. Locked abilities render
 * dimmed with a padlock; abilities always cast at/from the hero — the
 * buttons are triggers, not targets.
 */
export class AbilityBar {
  private readonly views: ButtonView[] = [];

  constructor(scene: Phaser.Scene, slots: readonly AbilitySlot[], cast: (abilityId: string) => void) {
    slots.slice(0, POSITIONS.length).forEach((slot, i) => {
      const pos = POSITIONS[i]!;
      const bg = scene.add
        .circle(pos.x, pos.y, BUTTON_RADIUS, 0x1a140c, 0.82)
        .setStrokeStyle(3, 0x59a844)
        .setDepth(25);
      const label = scene.add
        .text(pos.x, pos.y, slot.ability.name[0]!.toUpperCase(), {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#f5ead0',
        })
        .setOrigin(0.5)
        .setDepth(26);
      const sweep = scene.add.graphics().setDepth(27);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        cast(slot.ability.id);
      });
      this.views.push({ slot, bg, label, sweep, x: pos.x, y: pos.y });
    });
  }

  update(): void {
    for (const v of this.views) {
      const { slot } = v;
      v.sweep.clear();
      if (!slot.unlocked) {
        v.bg.setAlpha(0.35);
        v.label.setAlpha(0.35);
        v.bg.setStrokeStyle(3, 0x555555);
        continue;
      }
      const cooling = slot.cooldownRemaining > 0;
      v.bg.setAlpha(1);
      v.label.setAlpha(cooling ? 0.5 : 1);
      v.bg.setStrokeStyle(3, cooling ? 0x777777 : 0x59a844);
      if (cooling) {
        const frac = slot.cooldownRemaining / slot.ability.cooldown;
        v.sweep.fillStyle(0x000000, 0.55);
        v.sweep.slice(
          v.x,
          v.y,
          BUTTON_RADIUS - 2,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * frac,
          false,
        );
        v.sweep.fillPath();
      }
    }
  }
}
