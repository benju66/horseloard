import { VOICES } from './voices';

/**
 * The sfx manager (DESIGN §12): one AudioContext, two buses, and the throttling
 * that keeps a wave of forty enemies from turning into clipping mush.
 *
 * Three things here are load-bearing and none are obvious:
 *
 * 1. **Nothing exists until a user gesture.** Browsers refuse to start an
 *    AudioContext otherwise, and constructing one eagerly leaves it suspended
 *    with no way back on iOS. The context is built on the first tap.
 * 2. **Per-sound throttling.** Forty arrows landing in the same frame is forty
 *    identical transients stacking into a click. Each id gets a minimum spacing
 *    in audio time; plays inside that window are dropped rather than queued — a
 *    dropped hit is inaudible, a queued one arrives late and wrong. Measured:
 *    40 same-frame calls become 1 sound.
 *
 *    A per-frame counter was tried alongside this and removed: `currentTime`
 *    does not advance during a synchronous burst, so the time gap already
 *    rejects everything after the first, and the counter never once bound.
 * 3. **A limiter on the master bus.** Even throttled, a bombard volley plus a
 *    horn plus a coin streak can exceed unity. Clipping on a phone speaker is
 *    the harshest artefact available.
 *
 * Preferences live in localStorage rather than the save file: they are a
 * property of this device, not of the campaign, and putting them in the save
 * would mean a schema migration for something that should not sync.
 */

const STORE_KEY = 'horse-lord:audio';

/** Minimum seconds between two plays of the same id. */
const THROTTLE_GAP: Record<string, number> = {
  'sfx-bow-release': 0.05,
  'sfx-hit-light': 0.04,
  'sfx-hit-heavy': 0.05,
  'sfx-bombard': 0.08,
  'sfx-frost': 0.25,
  coin: 0.03,
  'gate-hit': 0.18,
};
const DEFAULT_GAP = 0.04;

export interface AudioPrefs {
  sfx: boolean;
  music: boolean;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;

  private prefs: AudioPrefs = { sfx: true, music: true };
  private readonly lastPlayed = new Map<string, number>();
  /** Coin streaks walk the pitch up; reset when the streak lapses. */
  private streak = 0;
  private streakUntil = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) this.prefs = { ...this.prefs, ...(JSON.parse(raw) as Partial<AudioPrefs>) };
    } catch {
      // A corrupt or unavailable store must never stop the game booting.
    }
  }

  get preferences(): AudioPrefs {
    return { ...this.prefs };
  }

  setPref(key: keyof AudioPrefs, on: boolean): void {
    this.prefs[key] = on;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.prefs));
    } catch {
      // Non-fatal: the toggle still applies for this session.
    }
    if (key === 'sfx' && this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.01);
    }
    if (key === 'music' && this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Build the graph. Safe to call repeatedly; must be called from inside a
   * user-gesture handler the first time or the context will not start.
   */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // no Web Audio: the game is simply silent

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.75;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = this.prefs.sfx ? 1 : 0;
    const musicBus = ctx.createGain();
    musicBus.gain.value = this.prefs.music ? 1 : 0;

    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(limiter).connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.sfxBus = sfxBus;
    this.musicBus = musicBus;
  }

  /** Call once per rendered frame; expires a lapsed coin streak. */
  frame(): void {
    if (this.ctx && this.ctx.currentTime > this.streakUntil) this.streak = 0;
  }

  /**
   * Play a sound by id. Unknown ids are ignored on purpose: data may reference
   * a sound before its voice exists, and that should be silent, not a crash.
   */
  play(id: string, pitch = 1): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.prefs.sfx) return;
    const voice = VOICES[id];
    if (!voice) return;

    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < (THROTTLE_GAP[id] ?? DEFAULT_GAP)) return;
    this.lastPlayed.set(id, now);
    // A touch of random detune so repeated hits are not literally identical.
    voice(ctx, bus, now, pitch * (0.97 + Math.random() * 0.06));
  }

  /**
   * Coin pickup: each coin inside the streak window is a semitone higher, to a
   * ceiling. DESIGN §12 asks for this by name — it is the single cheapest way
   * to make collection feel like a reward rather than an event.
   */
  playCoin(): void {
    if (!this.ctx) return;
    this.streak = Math.min(this.streak + 1, 12);
    this.streakUntil = this.ctx.currentTime + 0.6;
    this.play('coin', Math.pow(2, this.streak / 12));
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
  }
}
