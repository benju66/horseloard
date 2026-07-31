/**
 * Dynamic thumb joystick, DOM overlay edition (MIGRATION-3D.md Part A / MG.5).
 *
 * Feel is a straight port of the Phaser one, which was itself a straight port of
 * the prototype: 55px throw, 24px knob, spawns wherever the touch lands, dies on
 * release. That feel tested well twice — do not get creative here. Only the
 * substrate changed (absolutely-positioned divs instead of canvas circles); the
 * numbers and the behaviour are identical.
 */

const MAX_RADIUS = 55;
const KNOB_RADIUS = 24;

export class DomJoystick {
  /** normalized deflection, magnitude ≤ 1 — feed straight into HeroSystem.input */
  readonly value = { x: 0, y: 0 };

  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  get active(): boolean {
    return this.pointerId !== null;
  }

  /**
   * @param host element that receives the touches (usually the canvas wrapper)
   * @param layer element the visuals are appended to
   */
  constructor(host: HTMLElement, layer: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.style.display = 'none';
    this.knob.style.display = 'none';
    layer.append(this.base, this.knob);

    host.addEventListener('pointerdown', (ev) => {
      // Anything with [data-ui] is a button — it swallows its own touches so the
      // stick never spawns under the ability bar.
      if ((ev.target as HTMLElement).closest('[data-ui]')) return;
      if (this.pointerId !== null) return;
      this.pointerId = ev.pointerId;
      this.originX = ev.clientX;
      this.originY = ev.clientY;
      this.value.x = 0;
      this.value.y = 0;
      this.place(this.base, this.originX, this.originY);
      this.place(this.knob, this.originX, this.originY);
      this.base.style.display = '';
      this.knob.style.display = '';
      host.setPointerCapture(ev.pointerId);
    });

    host.addEventListener('pointermove', (ev) => {
      if (ev.pointerId !== this.pointerId) return;
      let dx = ev.clientX - this.originX;
      let dy = ev.clientY - this.originY;
      const m = Math.hypot(dx, dy);
      if (m > MAX_RADIUS) {
        dx *= MAX_RADIUS / m;
        dy *= MAX_RADIUS / m;
      }
      this.value.x = dx / MAX_RADIUS;
      this.value.y = dy / MAX_RADIUS;
      this.place(this.knob, this.originX + dx, this.originY + dy);
    });

    const release = (ev: PointerEvent) => {
      if (ev.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.value.x = 0;
      this.value.y = 0;
      this.base.style.display = 'none';
      this.knob.style.display = 'none';
    };
    host.addEventListener('pointerup', release);
    host.addEventListener('pointercancel', release);

    // Desktop convenience only — WASD exists for dev, never for the phone.
    const keys = new Set<string>();
    const applyKeys = () => {
      if (this.pointerId !== null) return;
      const x = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      const y = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
      const m = Math.hypot(x, y) || 1;
      this.value.x = x / m;
      this.value.y = y / m;
    };
    window.addEventListener('keydown', (e) => {
      keys.add(e.key.toLowerCase());
      applyKeys();
    });
    window.addEventListener('keyup', (e) => {
      keys.delete(e.key.toLowerCase());
      applyKeys();
    });
  }

  private place(el: HTMLDivElement, x: number, y: number): void {
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }

  static css(): string {
    return `
.joy-base {
  position: fixed; left: 0; top: 0;
  width: ${MAX_RADIUS * 2}px; height: ${MAX_RADIUS * 2}px;
  border-radius: 50%; border: 3px solid rgba(255,255,255,0.35);
  pointer-events: none; will-change: transform;
}
.joy-knob {
  position: fixed; left: 0; top: 0;
  width: ${KNOB_RADIUS * 2}px; height: ${KNOB_RADIUS * 2}px;
  border-radius: 50%; background: rgba(255,255,255,0.45);
  pointer-events: none; will-change: transform;
}`;
  }
}
