import * as THREE from 'three';

/**
 * Procedural motion for a mounted unit — no skeleton required.
 *
 * A fused horse-and-rider mesh is neither a biped nor a quadruped, so
 * auto-rigging has no body plan to latch onto. It does not need one. From a
 * fixed camera 55 degrees above the horizon, at phone size, a horse's legs
 * spend most of their time occluded by its own barrel; what the eye actually
 * reads as a gallop is what the *body* does. All of that is cheap to compute
 * and needs no bones:
 *
 *   yaw spring   the body swings toward a new heading over ~0.15s instead of
 *                snapping. This is the single largest contributor to "smooth"
 *                and the only one that is obvious by its absence.
 *   gait bob     one vertical rise and fall per stride, amplitude scaling with
 *                speed, so standing still is genuinely still.
 *   pitch rock   nose dips as the body rises, a quarter-cycle out of phase with
 *                the bob. Two sines out of phase is what separates a gallop
 *                from a pogo stick.
 *   bank         roll into turns, driven by angular velocity. Sells weight.
 *   breathe      a slow idle sine so a stopped hero is never a dead statue.
 *
 * Deliberately render-only (CLAUDE.md #2): it reads simulation state and writes
 * to an Object3D, and the sim neither knows nor cares that it exists. Nothing
 * here feeds back into the simulation, so it cannot desync anything, and two
 * clients running the same sim would agree regardless of what this does.
 *
 * Every constant is expressed as a fraction of unit height or in seconds, so
 * the feel survives a model swap.
 */

/** Tunables, gathered so they can be swept from one place. */
export interface MountMotion {
  /** Distance covered per stride, in world units. Sets bob frequency. */
  strideLength: number;
  /** Peak bob height, as a fraction of unit height. */
  bobHeight: number;
  /** Peak pitch rock, radians. */
  pitchAmount: number;
  /** Peak roll into a turn, radians. */
  bankAmount: number;
  /** Seconds for the body to catch up to a new heading (approx). */
  turnResponse: number;
  /** Idle breathing amplitude, fraction of unit height. */
  breathHeight: number;
  /** Idle breathing period, seconds. */
  breathPeriod: number;
}

export const DEFAULT_MOUNT_MOTION: MountMotion = {
  // 2.5 body lengths per stride at a gallop; a horse's body is about its own
  // height long, so 2.5 x 30 = 75. At the hero's 150 u/s that lands on two
  // strides per second, which is where a real gallop sits.
  strideLength: 75,
  bobHeight: 0.045,
  pitchAmount: 0.07,
  bankAmount: 0.24,
  turnResponse: 0.15,
  breathHeight: 0.006,
  breathPeriod: 3.4,
};

/** Shortest signed angular distance from a to b, in (-pi, pi]. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class MountAnimator {
  private yaw = 0;
  private gait = 0;
  private bank = 0;
  private breath = 0;
  /** Smoothed speed — raw sim speed steps discontinuously when input flicks. */
  private speed = 0;
  private started = false;

  constructor(
    private readonly unitHeight: number,
    private readonly motion: MountMotion = DEFAULT_MOUNT_MOTION,
  ) {}

  /** Drop all momentum — call when the view is recycled onto a new run. */
  reset(): void {
    this.yaw = 0;
    this.gait = 0;
    this.bank = 0;
    this.breath = 0;
    this.speed = 0;
    this.started = false;
  }

  /**
   * @param view      the hero's Object3D, already positioned in world space
   * @param dt        seconds since last frame (real time, not sim ticks)
   * @param headingX  sim heading, x component
   * @param headingY  sim heading, y component (maps to world z)
   * @param speed     current speed in world units/second
   * @param groundY   world y the feet should rest on
   * @param clipDriven when a real walk clip animates the body, the fake gait
   *                  (bob, pitch, breathe) is muted so the two never stack —
   *                  double-bobbing was the whole reason the rocking looked
   *                  bad. Yaw and bank stay: turning feel is not in any clip.
   */
  update(
    view: THREE.Object3D,
    dt: number,
    headingX: number,
    headingY: number,
    speed: number,
    groundY = 0,
    clipDriven = false,
  ): void {
    const m = this.motion;
    // Guard against a frame hitch integrating a huge step and snapping the
    // spring past its target.
    const step = Math.min(dt, 1 / 20);

    // --- heading: critically-damped-ish exponential approach ------------------
    const heading = Math.hypot(headingX, headingY);
    const targetYaw = heading > 0.01 ? Math.atan2(headingX, headingY) : this.yaw;

    if (!this.started) {
      // First frame: adopt the heading outright rather than swinging to it from
      // zero, which would spin the hero on every run start.
      this.yaw = targetYaw;
      this.started = true;
    }

    const delta = angleDelta(this.yaw, targetYaw);
    // 1 - e^(-t/tau) is framerate-independent, unlike a raw lerp factor.
    const k = 1 - Math.exp(-step / Math.max(0.001, m.turnResponse));
    const applied = delta * k;
    this.yaw += applied;

    // --- speed smoothing -----------------------------------------------------
    const speedK = 1 - Math.exp(-step / 0.12);
    this.speed += (speed - this.speed) * speedK;

    // --- gait ----------------------------------------------------------------
    // Phase advances with distance travelled, not with time, so the bob stays
    // locked to the ground however the speed changes. A hero at half speed
    // strides half as often, which is what stops the classic skating look.
    this.gait += (this.speed / Math.max(1, m.strideLength)) * Math.PI * 2 * step;
    if (this.gait > Math.PI * 2) this.gait -= Math.PI * 2;

    this.breath += (Math.PI * 2 * step) / m.breathPeriod;
    if (this.breath > Math.PI * 2) this.breath -= Math.PI * 2;

    // Motion fades in with speed so a stationary hero is genuinely still.
    const moving = Math.min(1, this.speed / 60);

    // --- bank ----------------------------------------------------------------
    // Angular velocity this frame, normalised by how fast a turn can be, then
    // eased so the roll trails the turn slightly instead of tracking it exactly.
    const angVel = applied / Math.max(1e-4, step);
    const targetBank = THREE.MathUtils.clamp(-angVel * 0.09, -1, 1) * m.bankAmount * moving;
    const bankK = 1 - Math.exp(-step / 0.11);
    this.bank += (targetBank - this.bank) * bankK;

    // --- compose -------------------------------------------------------------
    const gaitOn = clipDriven ? 0 : 1;
    const bob = Math.sin(this.gait) * m.bobHeight * this.unitHeight * moving * gaitOn;
    const breathe =
      Math.sin(this.breath) * m.breathHeight * this.unitHeight * (1 - moving) * gaitOn;
    // A quarter-cycle behind the bob: the body pitches nose-down as it rises.
    const pitch = Math.cos(this.gait) * m.pitchAmount * moving * gaitOn;

    view.position.y = groundY + Math.abs(bob) + breathe;
    view.rotation.set(pitch, this.yaw, this.bank, 'YXZ');
  }
}
