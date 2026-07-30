import Phaser from 'phaser';

const W = 118;
const H = 46;
const TAP_PAD = 8; // prototype: hit area extends past the visual

/**
 * Contextual world-space bubble (build / upgrade / forge): ride close →
 * bubble appears → tap. Zero UI literacy required (DESIGN §9).
 */
export class WorldBubble {
  onTap: (() => void) | null = null;

  private readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private enabled = false;
  private lastEnabled: boolean | null = null;

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add.graphics();
    this.title = scene.add
      .text(0, 19 - H / 2, '', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#f5ead0',
      })
      .setOrigin(0.5);
    this.sub = scene.add
      .text(0, 37 - H / 2, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#f6c945' })
      .setOrigin(0.5);

    const hit = scene.add
      .rectangle(0, 0, W + TAP_PAD * 2, H + TAP_PAD * 2, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      if (this.enabled) this.onTap?.();
    });

    this.container = scene.add
      .container(0, 0, [this.bg, hit, this.title, this.sub])
      .setDepth(30)
      .setVisible(false);
  }

  /** x = horizontal center, y = top edge (prototype convention). */
  show(x: number, y: number, title: string, sub: string, enabled: boolean): void {
    this.container.setPosition(x, y + H / 2).setVisible(true);
    this.title.setText(title);
    this.sub.setText(sub);
    this.sub.setColor(enabled ? '#f6c945' : '#999999');
    if (enabled !== this.lastEnabled) {
      this.lastEnabled = enabled;
      this.enabled = enabled;
      this.bg.clear();
      this.bg.fillStyle(enabled ? 0x3f7d2f : 0x3c3c3c, enabled ? 1 : 0.85);
      this.bg.fillRoundedRect(-W / 2, -H / 2, W, H, 12);
      this.bg.lineStyle(2, enabled ? 0x59a844 : 0x555555);
      this.bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 12);
    }
  }

  hide(): void {
    this.container.setVisible(false);
  }

  get visible(): boolean {
    return this.container.visible;
  }
}
