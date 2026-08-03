import type { Simulation } from '../../engine/simulation';

/**
 * A **readout**, not a control. Abilities fire themselves (AbilitySystem), so
 * these are cooldown dials telling you what your build is doing — the same job
 * a weapon row does in a survivor game.
 *
 * They were buttons. DESIGN §1 pillar 2 says "auto-fire means the thumb steers
 * and the brain plays", which was applied to the bow and then contradicted by
 * putting three buttons under the other thumb. Play feedback settled it.
 * `pointer-events` is off entirely now, which also means the bar can no longer
 * eat a touch meant for the joystick.
 *
 * Content-agnostic: buttons are built from whatever `sim.abilities.slots`
 * contains, labelled from the ability's own `name`. A fourth ability appears
 * here the day its JSON lands, with no edit to this file.
 *
 * A button exists for every ability and is *hidden* while locked, rather than
 * the bar only building the unlocked ones. Abilities are drafted mid-run now
 * (TRIANGLE.md §B.6), so a bar fixed at construction would hand a player a card
 * that unlocks nothing they can press.
 */

interface Slot {
  button: HTMLDivElement;
  label: HTMLSpanElement;
  sweep: HTMLDivElement;
  abilityId: string;
}

export class AbilityBar {
  private readonly slots: Slot[] = [];
  private sim: Simulation;
  private readonly wrap: HTMLDivElement;

  constructor(sim: Simulation, layer: HTMLElement) {
    this.sim = sim;

    const wrap = document.createElement('div');
    this.wrap = wrap;
    wrap.className = 'ability-bar';
    layer.append(wrap);

    for (const slot of sim.abilities.slots) {
      const button = document.createElement('div');
      button.className = 'ability';
      if (!slot.unlocked) button.style.display = 'none';

      const sweep = document.createElement('div');
      sweep.className = 'ability-cd';
      const label = document.createElement('span');
      label.className = 'ability-label';
      label.textContent = slot.ability.name;
      button.append(sweep, label);

      const abilityId = slot.ability.id;
      wrap.append(button);
      this.slots.push({ button, label, sweep, abilityId });
    }
  }

  /** Remove the bar from the DOM — used when a run ends and the map changes. */
  destroy(): void {
    this.wrap.remove();
    this.slots.length = 0;
  }

  /**
   * Point the bar at a new run. Buttons are unchanged — the ability roster is
   * data and does not vary between runs — only the sim they act on.
   */
  setSim(sim: Simulation): void {
    this.sim = sim;
  }

  /** Called each frame — only touches the DOM when a value actually changed. */
  sync(): void {
    for (const s of this.slots) {
      const slot = this.sim.abilities.getSlot(s.abilityId);
      if (!slot) continue;
      // Hidden rather than removed: a draft can unlock this mid-run, and
      // `display` is the one property that costs nothing to flip every frame.
      const shown = slot.unlocked ? '' : 'none';
      if (s.button.style.display !== shown) s.button.style.display = shown;
      if (!slot.unlocked) continue;
      const cooling = slot.cooldownRemaining > 0;
      const frac = cooling ? slot.cooldownRemaining / slot.ability.cooldown : 0;
      // Height of the dark sweep = fraction of cooldown remaining.
      const pct = `${Math.round(frac * 100)}%`;
      if (s.sweep.style.height !== pct) s.sweep.style.height = pct;
      // `dimmed` rather than `disabled`: nothing here is pressable, and the
      // state being communicated is "recharging", not "unavailable to you".
      if (s.button.classList.contains('is-cooling') !== cooling) {
        s.button.classList.toggle('is-cooling', cooling);
      }
    }
  }

  static css(): string {
    return `
.ability-bar {
  position: fixed; right: calc(env(safe-area-inset-right, 0px) + 14px);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
  display: flex; flex-direction: column; gap: 12px; pointer-events: none;
}
.ability {
  /* pointer-events: none — see the class comment. A readout that swallows
     touches in the bottom-right is a readout that eats your steering. */
  position: relative; pointer-events: none; overflow: hidden;
  width: 54px; height: 54px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.24);
  background: rgba(46,120,120,.7); color: #f2ecdd;
  box-shadow: 0 3px 10px rgba(0,0,0,.4);
  display: grid; place-items: center;
}
.ability.is-cooling { background: rgba(52,66,60,.62); }
.ability-cd {
  position: absolute; left: 0; right: 0; bottom: 0; height: 0%;
  background: rgba(0,0,0,.5); pointer-events: none;
}
.ability-label {
  position: relative; display: block; padding: 0 3px; text-align: center;
  font: 700 9px/1.1 ui-monospace, monospace; text-shadow: 0 1px 2px rgba(0,0,0,.7);
}`;
  }
}
