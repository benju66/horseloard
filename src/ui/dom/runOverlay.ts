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
  private readonly reward_el: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly again: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;
  private speedIndex: number;
  private shownFor: string | null = null;

  /** Assigned by the host: rebuild the run from scratch. */
  onRestart: (() => void) | null = null;
  /** Assigned by the host: leave the run and return to map select. */
  onExit: (() => void) | null = null;
  /** Assigned by the host: freeze/unfreeze the sim while the pause sheet is up. */
  onPauseChange: ((paused: boolean) => void) | null = null;
  /** Assigned by the host: abandon the run mid-fight (settles as a defeat). */
  onRetreat: (() => void) | null = null;
  private readonly exit: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly pausePanel: HTMLDivElement;
  private pausedFlag = false;
  private readonly bannerEl: HTMLDivElement;
  private readonly revealEl: HTMLDivElement;
  private readonly revealQueue: Array<{ name: string; intro: string }> = [];
  private revealBusy = false;

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
    this.reward_el = document.createElement('div');
    this.reward_el.className = 'run-reward';
    this.reward_el.style.display = 'none';
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
    this.panel.append(this.title, this.stats, this.reward_el, this.again, this.exit);

    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'wave-banner';
    const bt = document.createElement('div');
    bt.className = 'banner-title';
    const bs = document.createElement('div');
    bs.className = 'banner-sub';
    this.bannerEl.append(bt, bs);

    this.revealEl = document.createElement('div');
    this.revealEl.className = 'reveal-banner';
    const rc = document.createElement('div');
    rc.className = 'reveal-chip';
    rc.textContent = 'New foe';
    const rn = document.createElement('div');
    rn.className = 'reveal-name';
    const ri = document.createElement('div');
    ri.className = 'reveal-intro';
    this.revealEl.append(rc, rn, ri);

    // ─── Pause: the one interruption the run allows. Opens a sheet; the sheet
    // freezes the sim (via the host) rather than the sim knowing about menus.
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'pause-btn';
    this.pauseBtn.setAttribute('data-ui', '');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.textContent = '❚❚';
    this.pauseBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setPaused(true);
    });

    this.pausePanel = document.createElement('div');
    this.pausePanel.className = 'run-panel pause-panel';
    this.pausePanel.style.display = 'none';
    const pTitle = document.createElement('div');
    pTitle.className = 'run-title';
    pTitle.textContent = 'Paused';
    const resume = document.createElement('button');
    resume.className = 'run-again';
    resume.setAttribute('data-ui', '');
    resume.textContent = 'Ride on';
    resume.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setPaused(false);
    });
    const retreat = document.createElement('button');
    retreat.className = 'run-again ghost';
    retreat.setAttribute('data-ui', '');
    // Honest label: leaving mid-run settles as a defeat, and a defeat pays
    // per wave cleared (DESIGN §7) — retreat keeps what the run earned.
    retreat.textContent = 'Retreat to map select';
    retreat.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.pausedFlag = false;
      this.pausePanel.style.display = 'none';
      this.onRetreat?.();
    });
    this.pausePanel.append(pTitle, resume, retreat);

    layer.append(this.speedBtn, this.pauseBtn, this.panel, this.pausePanel, this.bannerEl, this.revealEl);
  }

  private setPaused(on: boolean): void {
    this.pausedFlag = on;
    this.pausePanel.style.display = on ? '' : 'none';
    this.onPauseChange?.(on);
  }

  /** Multiplier to apply to dt before advancing the sim. */
  get speed(): number {
    return SPEEDS[this.speedIndex]!;
  }

  private syncSpeedLabel(): void {
    this.speedBtn.textContent = `×${this.speed}`;
  }

  /** Show the summary once the run resolves; idempotent per outcome. */
  /**
   * What the run paid the career, set by the host once the run has settled.
   *
   * Passed in rather than computed here: `settleRun` already knows, and two
   * counts of the same reward is one count too many — the results screen and
   * the save must never be able to disagree about what you earned.
   */
  private reward: { xp: number; levels: number; points: number } | null = null;

  showReward(xp: number, levels: number, points: number): void {
    this.reward = { xp, levels, points };
    this.shownFor = null; // force a re-render now the numbers are known
  }

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
    this.pauseBtn.style.display = 'none';

    // The payout, stated plainly. A defeat pays too — a failed run is progress
    // (DESIGN §7), and saying so is the difference between a loss that stings
    // and a loss that stops you playing.
    if (this.reward) {
      const r = this.reward;
      const parts = [`+${r.xp} XP`];
      if (r.levels > 0) parts.push(`${r.levels} level${r.levels > 1 ? 's' : ''} gained`);
      if (r.points > 0) parts.push(`${r.points} point${r.points > 1 ? 's' : ''} to spend`);
      this.reward_el.textContent = parts.join('  ·  ');
      this.reward_el.style.display = '';
      this.reward_el.classList.toggle('has-points', r.points > 0);
    } else {
      this.reward_el.style.display = 'none';
    }
  }

  /**
   * Special-wave warning (DESIGN §8): fades in, holds, fades. Turns the wave
   * preview from informational into dramatic, which is its whole job.
   */
  banner(name: string, subtitle: string): void {
    this.bannerEl.classList.remove('is-milestone');
    this.showBanner(`⚠ ${name}`, subtitle);
  }

  /**
   * Endless milestone (DESIGN §7 payouts): same stage as the wave banner, but
   * gold, not red — an achievement, not a threat. Fires between waves, when the
   * warning banner is guaranteed idle, so the two can share one element.
   */
  milestone(title: string, subtitle: string): void {
    this.bannerEl.classList.add('is-milestone');
    this.showBanner(title, subtitle);
  }

  private showBanner(title: string, subtitle: string): void {
    this.bannerEl.querySelector('.banner-title')!.textContent = title;
    this.bannerEl.querySelector('.banner-sub')!.textContent = subtitle;
    this.bannerEl.classList.remove('show');
    // Force a reflow so re-triggering the same banner replays the animation.
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  /**
   * First-encounter card. Queued, because a wave can introduce two species in
   * the same second and news read over news is news lost. Its own element,
   * because reveals fire on *spawn* — often within a breath of the wave-start
   * warning banner — and must not evict it.
   *
   * Tells you anything, asks you nothing: non-interactive, self-dismissing,
   * and the run never pauses for it.
   */
  reveal(name: string, intro: string): void {
    this.revealQueue.push({ name, intro });
    this.pumpReveals();
  }

  private pumpReveals(): void {
    if (this.revealBusy) return;
    const next = this.revealQueue.shift();
    if (!next) return;
    this.revealBusy = true;
    this.revealEl.querySelector('.reveal-name')!.textContent = next.name;
    this.revealEl.querySelector('.reveal-intro')!.textContent = next.intro;
    this.revealEl.classList.remove('show');
    void this.revealEl.offsetWidth;
    this.revealEl.classList.add('show');
    // Slightly longer than the animation, so back-to-back cards breathe.
    window.setTimeout(() => {
      this.revealBusy = false;
      this.pumpReveals();
    }, 3400);
  }

  hide(): void {
    this.panel.style.display = 'none';
    this.speedBtn.style.display = '';
    this.pauseBtn.style.display = '';
    this.shownFor = null;
    // Leaving the run always unwinds the pause — a frozen sim behind the map
    // select would freeze the *next* run's opening too.
    if (this.pausedFlag) this.setPaused(false);
    this.pausePanel.style.display = 'none';
    // A queued reveal belongs to the run that met the enemy; don't let it
    // play over the map select or the next run's opening.
    this.revealQueue.length = 0;
    this.revealEl.classList.remove('show');
  }

  static css(): string {
    return `
/* Below the mute button, not on top of it — the two share the right edge and
   at their old offsets (40 vs 34) their boxes overlapped almost entirely. */
.speed-btn {
  position: fixed; top: calc(env(safe-area-inset-top, 0px) + 86px);
  right: calc(env(safe-area-inset-right, 0px) + 14px); pointer-events: auto;
  width: 52px; height: 40px; border-radius: 12px; border: 1px solid rgba(255,255,255,.22);
  background: rgba(28,40,34,.85); color: #f2ecdd; font: 700 15px ui-monospace, monospace;
}
body.left-hand .speed-btn { right: auto; left: calc(env(safe-area-inset-left, 0px) + 14px); }
/* Opposite corner from mute/speed, so each thumb owns one edge of chrome.
   Left-hand mode swaps it with them. */
.pause-btn {
  position: fixed; top: calc(env(safe-area-inset-top, 0px) + 40px);
  left: calc(env(safe-area-inset-left, 0px) + 10px); pointer-events: auto;
  width: 40px; height: 40px; border-radius: 12px; border: 0;
  background: rgba(20,30,24,.6); color: #f2ecdd; font: 700 12px/1 ui-monospace, monospace;
}
body.left-hand .pause-btn { left: auto; right: calc(env(safe-area-inset-right, 0px) + 10px); }
.pause-panel { background: rgba(10,16,20,.93); }
.pause-panel .run-title { color: #f2ecdd; }
.run-panel {
  position: fixed; inset: 0; pointer-events: auto;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  padding: 28px; text-align: center; background: rgba(12,22,14,.93);
}
.run-panel.is-defeat { background: rgba(24,10,10,.93); }
.run-title { font: 700 34px/1.15 Georgia, serif; color: #f6c945; }
.run-panel.is-defeat .run-title { color: #e5484d; }
.run-stats { font: 600 14px/1.6 ui-monospace, monospace; color: #cdc6b4; max-width: 320px; }
/* The payout. Gold only when there is something waiting to be spent, so the
   colour itself is the call back into the tree. */
.run-reward {
  margin-top: 4px; padding: 8px 16px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,.16); color: #9fe3b8;
  font: 700 13px ui-monospace, monospace; letter-spacing: .03em;
}
.run-reward.has-points { color: #f6c945; border-color: #f6c945; }
.run-again {
  margin-top: 10px; padding: 14px 30px; border-radius: 16px; border: 0;
  background: rgba(46,120,120,.92); color: #f2ecdd; font: 700 16px ui-monospace, monospace;
}
.run-again.ghost { margin-top: 0; background: transparent; border: 1px solid rgba(255,255,255,.25); }
.wave-banner {
  position: fixed; left: 0; right: 0; top: 34%; pointer-events: none; text-align: center;
  padding: 16px 12px; background: rgba(26,12,12,.85); opacity: 0;
}
.wave-banner.show { animation: banner-flash 2.6s ease-out forwards; }
@keyframes banner-flash {
  0% { opacity: 0; transform: scale(.94); }
  12% { opacity: 1; transform: scale(1); }
  74% { opacity: 1; }
  100% { opacity: 0; }
}
.banner-title { font: 700 30px Georgia, serif; color: #e5484d; }
.banner-sub { font: 400 13px sans-serif; color: #f5ead0; margin-top: 4px; }
.wave-banner.is-milestone { background: rgba(18,24,12,.85); }
.wave-banner.is-milestone .banner-title { color: #f6c945; }
.reveal-banner {
  position: fixed; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 88px);
  transform: translateX(-50%); max-width: min(320px, 86vw);
  pointer-events: none; text-align: center; padding: 10px 20px;
  border-radius: 14px; border: 1px solid rgba(246,201,69,.45);
  background: rgba(16,20,14,.9); opacity: 0;
}
.reveal-banner.show { animation: reveal-flash 3.1s ease-out forwards; }
@keyframes reveal-flash {
  0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  10% { opacity: 1; transform: translateX(-50%) translateY(0); }
  82% { opacity: 1; }
  100% { opacity: 0; }
}
.reveal-chip { font: 700 10px/1 sans-serif; letter-spacing: .18em; text-transform: uppercase; color: #f6c945; }
.reveal-name { font: 700 20px Georgia, serif; color: #f2ecdd; margin-top: 4px; }
.reveal-intro { font: 400 12px/1.45 sans-serif; color: #cdc6b4; margin-top: 3px; }`;
  }
}
