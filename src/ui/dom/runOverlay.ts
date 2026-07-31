import type { Simulation } from '../../engine/simulation';

/**
 * End-of-run summary and the ×1/×2 speed toggle (MG.5).
 *
 * Copy matches the Phaser ResultsScene so the two builds read identically while
 * both exist — "The road holds" / "The keep has fallen". Stars score on damage
 * TAKEN, never HP remaining, so repair can never buy a star (DESIGN §3); this
 * screen just displays what the sim already decided.
 */

/** Tick multipliers offered by the toggle. "Auto" is deliberately absent. */
const SPEEDS = [1, 2] as const;
const SPEED_KEY = 'horse-lord:speed';

export class RunOverlay {
  private readonly panel: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly again: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;
  private speedIndex: number;
  private shownFor: string | null = null;

  /** Assigned by the host: rebuild the run from scratch. */
  onRestart: (() => void) | null = null;
  /** Assigned by the host: leave the run and return to map select. */
  onExit: (() => void) | null = null;
  private readonly exit: HTMLButtonElement;

  constructor(layer: HTMLElement) {
    const stored = Number(localStorage.getItem(SPEED_KEY));
    const found = SPEEDS.indexOf(stored as (typeof SPEEDS)[number]);
    this.speedIndex = found >= 0 ? found : 0;

    this.speedBtn = document.createElement('button');
    this.speedBtn.className = 'speed-btn';
    this.speedBtn.setAttribute('data-ui', '');
    this.speedBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
      localStorage.setItem(SPEED_KEY, String(this.speed));
      this.syncSpeedLabel();
    });
    this.syncSpeedLabel();

    this.panel = document.createElement('div');
    this.panel.className = 'run-panel';
    this.panel.style.display = 'none';
    this.title = document.createElement('div');
    this.title.className = 'run-title';
    this.stats = document.createElement('div');
    this.stats.className = 'run-stats';
    this.again = document.createElement('button');
    this.again.className = 'run-again';
    this.again.setAttribute('data-ui', '');
    this.again.textContent = 'Ride again';
    this.again.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.hide();
      this.onRestart?.();
    });
    this.exit = document.createElement('button');
    this.exit.className = 'run-again ghost';
    this.exit.setAttribute('data-ui', '');
    this.exit.textContent = 'Map select';
    this.exit.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.hide();
      this.onExit?.();
    });
    this.panel.append(this.title, this.stats, this.again, this.exit);
    layer.append(this.speedBtn, this.panel);
  }

  /** Multiplier to apply to dt before advancing the sim. */
  get speed(): number {
    return SPEEDS[this.speedIndex]!;
  }

  private syncSpeedLabel(): void {
    this.speedBtn.textContent = `×${this.speed}`;
  }

  /** Show the summary once the run resolves; idempotent per outcome. */
  sync(sim: Simulation, leaks: number): void {
    const over = sim.phase === 'done' || sim.phase === 'defeat';
    if (!over) {
      this.shownFor = null;
      return;
    }
    const key = `${sim.phase}:${sim.waveRunner.waveNumber}`;
    if (this.shownFor === key) return;
    this.shownFor = key;

    const victory = sim.phase === 'done';
    this.panel.style.display = '';
    this.panel.classList.toggle('is-defeat', !victory);
    this.title.textContent = victory ? 'The road holds' : 'The keep has fallen';
    this.stats.textContent =
      `${victory ? '★'.repeat(sim.stars()) + '☆'.repeat(3 - sim.stars()) + '  ·  ' : ''}` +
      `waves ${sim.waveRunner.waveNumber}/${sim.waveRunner.totalWaves}  ·  ` +
      `kills ${sim.kills}  ·  damage taken ${Math.round(sim.gate.totalDamageTaken)}  ·  leaks ${leaks}`;
    this.speedBtn.style.display = 'none';
  }

  hide(): void {
    this.panel.style.display = 'none';
    this.speedBtn.style.display = '';
    this.shownFor = null;
  }

  static css(): string {
    return `
.speed-btn {
  position: fixed; top: calc(env(safe-area-inset-top, 0px) + 40px);
  right: calc(env(safe-area-inset-right, 0px) + 14px); pointer-events: auto;
  width: 52px; height: 40px; border-radius: 12px; border: 1px solid rgba(255,255,255,.22);
  background: rgba(28,40,34,.85); color: #f2ecdd; font: 700 15px ui-monospace, monospace;
}
.run-panel {
  position: fixed; inset: 0; pointer-events: auto;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  padding: 28px; text-align: center; background: rgba(12,22,14,.93);
}
.run-panel.is-defeat { background: rgba(24,10,10,.93); }
.run-title { font: 700 34px/1.15 Georgia, serif; color: #f6c945; }
.run-panel.is-defeat .run-title { color: #e5484d; }
.run-stats { font: 600 14px/1.6 ui-monospace, monospace; color: #cdc6b4; max-width: 320px; }
.run-again {
  margin-top: 10px; padding: 14px 30px; border-radius: 16px; border: 0;
  background: rgba(46,120,120,.92); color: #f2ecdd; font: 700 16px ui-monospace, monospace;
}
.run-again.ghost { margin-top: 0; background: transparent; border: 1px solid rgba(255,255,255,.25); }`;
  }
}
