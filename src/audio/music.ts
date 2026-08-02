/**
 * Generative score (DESIGN §12): build-calm and wave-tension layers over one
 * shared clock, crossfaded, plus a boss layer.
 *
 * Layers rather than tracks. A crossfade between two separate loops has to
 * either cut mid-phrase or wait for a boundary; both are audible, and phase
 * changes here are driven by the player pressing a button whenever they like.
 * Instead one clock runs the whole time and every layer plays into its own
 * gain. Switching phase ramps gains, so the harmony never lurches and the
 * transition can land anywhere in the bar.
 *
 * Scheduling uses the standard Web Audio lookahead: a coarse timer wakes up
 * often enough to queue notes a little ahead of the playhead with exact `when`
 * times. Firing notes straight from a timer would put every one of them at the
 * mercy of frame jitter, which on a phone under load is audible as swing.
 *
 * The music is deliberately thin. It sits under forty simultaneous combat
 * sounds; anything busier turns the mix to mud, and the SFX are what carry the
 * information.
 */

export type MusicPhase = 'calm' | 'tension';

/** D aeolian, the scale the whole score is built from. */
const ROOT = 146.83; // D3
const SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor degrees, in semitones

/** i – VI – III – VII, one bar each: moody without being funereal. */
const PROGRESSION = [0, 5, 2, 6];

const BPM = 96;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
/** How far ahead notes are queued, and how often the scheduler wakes. */
const LOOKAHEAD = 0.35;
const TICK_MS = 90;

function degreeHz(degree: number, octave = 0): number {
  const wrapped = ((degree % SCALE.length) + SCALE.length) % SCALE.length;
  const oct = Math.floor(degree / SCALE.length) + octave;
  return ROOT * Math.pow(2, SCALE[wrapped]! / 12 + oct);
}

interface Layer {
  gain: GainNode;
  target: number;
}

export class MusicDirector {
  private readonly ctx: AudioContext;
  private readonly out: AudioNode;
  private readonly layers: Record<'pad' | 'pulse' | 'lead' | 'boss', Layer>;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Absolute context time of the next bar to be scheduled. */
  private nextBarAt = 0;
  private bar = 0;
  private phase: MusicPhase = 'calm';
  private boss = false;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
    const mk = (initial: number): Layer => {
      const gain = ctx.createGain();
      gain.gain.value = initial;
      gain.connect(out);
      return { gain, target: initial };
    };
    this.layers = { pad: mk(1), pulse: mk(0), lead: mk(0), boss: mk(0) };
  }

  start(): void {
    if (this.timer) return;
    this.nextBarAt = this.ctx.currentTime + 0.1;
    this.bar = 0;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Ramp the whole thing out rather than cutting; a hard stop on a sustained
    // pad is a click.
    for (const layer of Object.values(this.layers)) {
      layer.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      layer.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
      layer.target = 0;
    }
  }

  setPhase(phase: MusicPhase): void {
    if (phase === this.phase) return;
    this.phase = phase;
    this.applyTargets();
  }

  /** Boss present: mechanical, not a content id — see the caller. */
  setBoss(present: boolean): void {
    if (present === this.boss) return;
    this.boss = present;
    this.applyTargets();
  }

  private applyTargets(): void {
    const tension = this.phase === 'tension';
    this.ramp('pad', tension ? 0.55 : 1);
    this.ramp('pulse', tension ? 1 : 0);
    this.ramp('lead', tension ? 0.8 : 0);
    this.ramp('boss', this.boss ? 1 : 0);
  }

  private ramp(name: keyof MusicDirector['layers'], target: number): void {
    const layer = this.layers[name];
    layer.target = target;
    // ~1.2s to settle: long enough to feel like a transition, short enough that
    // a wave started and cleared quickly still reads as two different moods.
    layer.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  private schedule(): void {
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (this.nextBarAt < horizon) {
      this.scheduleBar(this.nextBarAt, this.bar);
      this.nextBarAt += BAR;
      this.bar++;
    }
  }

  private scheduleBar(at: number, bar: number): void {
    const root = PROGRESSION[bar % PROGRESSION.length]!;

    // ── Pad: the chord, held. Always present, quieter under tension. ──
    for (const interval of [0, 2, 4]) {
      this.voice(this.layers.pad.gain, at, degreeHz(root + interval, 0), BAR * 1.05, 'sine', 0.09);
    }

    // ── Pulse: eighth-note bass. The engine of the wave phase. ──
    for (let i = 0; i < 8; i++) {
      const t = at + i * (BEAT / 2);
      const accent = i % 4 === 0;
      this.voice(
        this.layers.pulse.gain,
        t,
        degreeHz(root, -1),
        BEAT * 0.42,
        'triangle',
        accent ? 0.16 : 0.09,
      );
    }

    // ── Lead: a sparse arpeggio, offset so it does not stack on the pulse. ──
    const arp = [0, 4, 2, 4, 0, 6, 4, 2];
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 1) continue; // half the notes: sparse is the point
      const t = at + i * (BEAT / 2) + BEAT / 4;
      this.voice(this.layers.lead.gain, t, degreeHz(root + arp[i]!, 1), BEAT * 0.5, 'triangle', 0.07);
    }

    // ── Boss: an octave-below drone plus a slow heartbeat on beats 1 and 3. ──
    this.voice(this.layers.boss.gain, at, degreeHz(root, -2), BAR * 1.05, 'sawtooth', 0.05);
    for (const beat of [0, 2]) {
      this.thump(this.layers.boss.gain, at + beat * BEAT);
    }
  }

  private voice(
    out: AudioNode,
    when: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    peak: number,
  ): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    // Soft attack: these are pads and plucks, not percussion. A click here
    // would be far more noticeable than in a combat sound.
    const attack = Math.min(0.08, dur * 0.25);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(out);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private thump(out: AudioNode, when: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, when);
    osc.frequency.exponentialRampToValueAtTime(38, when + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.3, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    osc.connect(g).connect(out);
    osc.start(when);
    osc.stop(when + 0.25);
  }
}
