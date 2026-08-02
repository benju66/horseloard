/**
 * Procedural SFX — every sound in the game, synthesised at play time.
 *
 * DESIGN §12 suggests CC0 sample packs. This does the same job with no files:
 * nothing to download, nothing to licence, nothing added to the bundle, and
 * every sound tunable by editing a number instead of re-recording. It follows
 * the pattern the palette and the app icons already use — generated in code so
 * the definition stays a single source of truth.
 *
 * Samples remain a drop-in upgrade later: callers ask for a sound by id through
 * the manifest in `audioManager`, so swapping a synth voice for a decoded
 * buffer is a change behind that seam, not at every call site.
 *
 * Everything here is short, dry and mid-forward on purpose. These play forty at
 * a time over a phone speaker, where long tails turn into mud and sub-bass
 * turns into nothing at all.
 */

/** A voice renders itself into `ctx` at `when`, through `out`. */
export type Voice = (ctx: AudioContext, out: AudioNode, when: number, pitch: number) => void;

/** Shared, lazily-built noise. Regenerating white noise per shot is real garbage. */
let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/** Percussive envelope: instant attack, exponential decay. */
function env(ctx: AudioContext, when: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  return g;
}

interface ToneOpts {
  type?: OscillatorType;
  from: number;
  to?: number;
  peak?: number;
  decay: number;
}

function tone(ctx: AudioContext, out: AudioNode, when: number, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.from, when);
  if (o.to !== undefined && o.to !== o.from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), when + o.decay);
  }
  const g = env(ctx, when, o.peak ?? 0.3, o.decay);
  osc.connect(g).connect(out);
  osc.start(when);
  osc.stop(when + o.decay + 0.02);
}

interface HissOpts {
  peak?: number;
  decay: number;
  freq: number;
  q?: number;
  type?: BiquadFilterType;
  sweepTo?: number;
}

function hiss(ctx: AudioContext, out: AudioNode, when: number, o: HissOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq, when);
  if (o.sweepTo !== undefined) {
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.sweepTo), when + o.decay);
  }
  f.Q.value = o.q ?? 1;
  const g = env(ctx, when, o.peak ?? 0.25, o.decay);
  src.connect(f).connect(g).connect(out);
  src.start(when);
  src.stop(when + o.decay + 0.02);
}

/**
 * The voice table. Keys are the `sfxRef` values already present in the game
 * data, plus the events that have no data hook of their own.
 *
 * `pitch` is a multiplier the caller supplies — coin streaks walk it upward,
 * and small variation on repeated sounds is what stops forty arrows sounding
 * like a machine.
 */
export const VOICES: Record<string, Voice> = {
  // ─── Combat ───
  'sfx-bow-release': (c, o, t, p) => {
    hiss(c, o, t, { freq: 2600 * p, sweepTo: 900 * p, decay: 0.1, peak: 0.16, q: 0.8 });
    tone(c, o, t, { type: 'triangle', from: 320 * p, to: 180 * p, decay: 0.07, peak: 0.1 });
  },
  'sfx-hit-light': (c, o, t, p) => {
    hiss(c, o, t, { freq: 1800 * p, decay: 0.05, peak: 0.16, q: 1.4 });
    tone(c, o, t, { type: 'square', from: 420 * p, to: 240 * p, decay: 0.045, peak: 0.07 });
  },
  'sfx-hit-heavy': (c, o, t, p) => {
    hiss(c, o, t, { freq: 700 * p, decay: 0.12, peak: 0.2, q: 0.7 });
    tone(c, o, t, { type: 'square', from: 180 * p, to: 70 * p, decay: 0.13, peak: 0.22 });
  },
  'sfx-bombard': (c, o, t, p) => {
    // Body plus a low thump: the thump is what a phone speaker actually renders.
    hiss(c, o, t, { freq: 900 * p, sweepTo: 180 * p, decay: 0.34, peak: 0.34, q: 0.5 });
    tone(c, o, t, { type: 'sine', from: 150 * p, to: 44 * p, decay: 0.3, peak: 0.34 });
  },
  'sfx-frost': (c, o, t, p) => {
    hiss(c, o, t, { type: 'highpass', freq: 3200 * p, decay: 0.4, peak: 0.07 });
    tone(c, o, t, { type: 'sine', from: 1400 * p, to: 2100 * p, decay: 0.36, peak: 0.05 });
  },

  // ─── Hero and abilities ───
  'sfx-charge': (c, o, t, p) => {
    hiss(c, o, t, { freq: 300 * p, sweepTo: 1500 * p, decay: 0.32, peak: 0.22, q: 0.6 });
    tone(c, o, t, { type: 'sawtooth', from: 90 * p, to: 240 * p, decay: 0.3, peak: 0.12 });
  },
  'sfx-volley': (c, o, t, p) => {
    hiss(c, o, t, { freq: 1500 * p, sweepTo: 3800 * p, decay: 0.5, peak: 0.16, q: 0.5 });
  },
  'sfx-rally-horn': (c, o, t, p) => {
    // Two stacked fifths, the cheapest thing that reads as a horn.
    for (const [mult, peak] of [[1, 0.2], [1.5, 0.12], [2, 0.07]] as const) {
      tone(c, o, t, { type: 'sawtooth', from: 196 * p * mult, decay: 0.75, peak });
    }
  },

  'sfx-caltrops': (c, o, t, p) => {
    // A handful of iron hitting dirt: bright scatter, no tone. Deliberately
    // unlike the bow sounds — this ability leaves something behind rather than
    // hitting something now, and the ear should be able to tell.
    hiss(c, o, t, { type: 'highpass', freq: 2600 * p, decay: 0.22, peak: 0.13 });
    hiss(c, o, t + 0.05, { type: 'highpass', freq: 3400 * p, decay: 0.3, peak: 0.08 });
  },

  // ─── Economy and building ───
  coin: (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', from: 1180 * p, decay: 0.09, peak: 0.12 });
    tone(c, o, t + 0.035, { type: 'triangle', from: 1760 * p, decay: 0.1, peak: 0.09 });
  },
  build: (c, o, t, p) => {
    tone(c, o, t, { type: 'square', from: 150 * p, to: 80 * p, decay: 0.16, peak: 0.2 });
    hiss(c, o, t, { freq: 900, decay: 0.1, peak: 0.14, q: 0.8 });
  },
  upgrade: (c, o, t, p) => {
    tone(c, o, t, { type: 'triangle', from: 520 * p, decay: 0.1, peak: 0.14 });
    tone(c, o, t + 0.06, { type: 'triangle', from: 780 * p, decay: 0.14, peak: 0.14 });
  },
  error: (c, o, t) => {
    tone(c, o, t, { type: 'square', from: 160, to: 110, decay: 0.13, peak: 0.12 });
  },

  // ─── Stakes ───
  'gate-hit': (c, o, t, p) => {
    tone(c, o, t, { type: 'sine', from: 96 * p, to: 50 * p, decay: 0.36, peak: 0.3 });
    hiss(c, o, t, { freq: 420, decay: 0.2, peak: 0.16, q: 0.6 });
  },
  'wave-horn': (c, o, t, p) => {
    for (const [mult, peak] of [[1, 0.22], [1.5, 0.13], [2.01, 0.08]] as const) {
      tone(c, o, t, { type: 'sawtooth', from: 147 * p * mult, decay: 1.0, peak });
    }
  },
  victory: (c, o, t) => {
    // Rising major triad — the only long, tonal sound in the game.
    [523, 659, 784, 1047].forEach((f, i) => {
      tone(c, o, t + i * 0.11, { type: 'triangle', from: f, decay: 0.55, peak: 0.17 });
    });
  },
  defeat: (c, o, t) => {
    [392, 330, 262, 196].forEach((f, i) => {
      tone(c, o, t + i * 0.16, { type: 'sawtooth', from: f, decay: 0.7, peak: 0.15 });
    });
  },
};
