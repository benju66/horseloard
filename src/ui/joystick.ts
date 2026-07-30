import Phaser from 'phaser';

/** Prototype-exact feel constants: 55px throw, 24px knob. */
const MAX_RADIUS = 55;
const KNOB_RADIUS = 24;

/**
 * Dynamic thumb joystick: spawns wherever the touch lands, anywhere that
 * isn't an interactive UI element. Exposes a normalized vector (|v| ≤ 1).
 * Ported from the prototype — it tested well; don't get creative here.
 */
export class VirtualJoystick {
  /** normalized deflection, magnitude ≤ 1 */
  readonly value = { x: 0, y: 0 };
  get active(): boolean {
    return this.pointerId !== null;
  }

  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene) {
    this.base = scene.add
      .circle(0, 0, MAX_RADIUS)
      .setStrokeStyle(3, 0xffffff, 0.35)
      .setDepth(40)
      .setVisible(false);
    this.knob = scene.add
      .circle(0, 0, KNOB_RADIUS, 0xffffff, 0.45)
      .setDepth(41)
      .setVisible(false);

    scene.input.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.length > 0 || this.pointerId !== null) return;
        this.pointerId = pointer.id;
        this.originX = pointer.worldX;
        this.originY = pointer.worldY;
        this.value.x = 0;
        this.value.y = 0;
        this.base.setPosition(this.originX, this.originY).setVisible(true);
        this.knob.setPosition(this.originX, this.originY).setVisible(true);
      },
    );

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.pointerId) return;
      let dx = pointer.worldX - this.originX;
      let dy = pointer.worldY - this.originY;
      const m = Math.hypot(dx, dy);
      if (m > MAX_RADIUS) {
        dx *= MAX_RADIUS / m;
        dy *= MAX_RADIUS / m;
      }
      this.value.x = dx / MAX_RADIUS;
      this.value.y = dy / MAX_RADIUS;
      this.knob.setPosition(this.originX + dx, this.originY + dy);
    });

    const release = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.pointerId) return;
      this.pointerId = null;
      this.value.x = 0;
      this.value.y = 0;
      this.base.setVisible(false);
      this.knob.setVisible(false);
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }
}
