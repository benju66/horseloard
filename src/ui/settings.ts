/**
 * Device settings: haptics and handedness. Like audio prefs, these live in
 * localStorage rather than the save file — they are a property of this phone,
 * not of the campaign, and a schema migration for a toggle that should never
 * sync would be the wrong cost (see audioManager.ts for the same argument).
 */

const STORE_KEY = 'horse-lord:settings';

export interface Settings {
  /** Vibration on the run's physical beats. Silently absent where unsupported (iOS). */
  haptics: boolean;
  /**
   * Mirror the fixed side chrome (ability readout, speed, mute) to the left
   * edge. The joystick needs no mirroring — it spawns wherever the thumb
   * lands — so handedness is purely about which edge the readouts occupy:
   * the one your steering thumb covers, or the other one.
   */
  leftHand: boolean;
}

export class SettingsStore {
  private prefs: Settings = { haptics: true, leftHand: false };
  readonly onChange: Array<(prefs: Settings) => void> = [];

  constructor() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) this.prefs = { ...this.prefs, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      // A corrupt or unavailable store must never stop the game booting.
    }
  }

  get settings(): Settings {
    return { ...this.prefs };
  }

  set(key: keyof Settings, on: boolean): void {
    this.prefs[key] = on;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.prefs));
    } catch {
      // Non-fatal: the toggle still applies for this session.
    }
    for (const fn of this.onChange) fn(this.settings);
  }

  /**
   * Vibrate, if the player wants it and the device can. One call site per
   * beat, all gated here, so muting haptics is one flag and not a hunt.
   */
  buzz(pattern: number | number[]): void {
    if (!this.prefs.haptics) return;
    // iOS Safari has no vibration API at all; this is the supported check.
    if (typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(pattern);
  }
}
