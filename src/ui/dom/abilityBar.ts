import type { Simulation } from '../../engine/simulation';

/**
 * The right-thumb layer (DESIGN §4): up to three ability buttons in a
 * bottom-right arc, all cast at/from the hero position — never tap-anywhere
 * targeting.
 *
 * Content-agnostic: buttons are built from whatever `sim.abilities.slots`
 * contains, labelled from the ability's own `name`. A fourth ability appears
 * here the day its JSON lands, with no edit to this file.
 */

interface Slot {
  button: HTMLButtonElement;
  label: HTMLSpanElement;
  sweep: HTMLDivElement;
  abilityId: string;
}

export class AbilityBar {
  private readonly slots: Slot[] = [];
  private readonly sim: Simulation;

  constructor(sim: Simulation, layer: HTMLElement) {
    this.sim = sim;

    const wrap = document.createElement('div');
    wrap.className = 'ability-bar';
    layer.append(wrap);

    for (const slot of sim.abilities.slots) {
      if (!slot.unlocked) continue;
      const button = document.createElement('button');
      button.className = 'ability';
      button.setAttribute('data-ui', '');

      const sweep = document.createElement('div');
      sweep.className = 'ability-cd';
      const label = document.createElement('span');
      label.className = 'ability-label';
      label.textContent = slot.ability.name;
      button.append(sweep, label);

      const abilityId = slot.ability.id;
      button.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.sim.castAbility(abilityId);
      });

      wrap.append(button);
      this.slots.push({ button, label, sweep, abilityId });
    }
  }

  /** Called each frame — only touches the DOM when a value actually changed. */
  sync(): void {
    for (const s of this.slots) {
      const slot = this.sim.abilities.getSlot(s.abilityId);
      if (!slot) continue;
      const cooling = slot.cooldownRemaining > 0;
      const frac = cooling ? slot.cooldownRemaining / slot.ability.cooldown : 0;
      // Height of the dark sweep = fraction of cooldown remaining.
      const pct = `${Math.round(frac * 100)}%`;
      if (s.sweep.style.height !== pct) s.sweep.style.height = pct;
      if (s.button.disabled !== cooling) s.button.disabled = cooling;
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
  position: relative; pointer-events: auto; overflow: hidden;
  width: 74px; height: 74px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.28);
  background: rgba(46,120,120,.85); color: #f2ecdd;
  box-shadow: 0 4px 14px rgba(0,0,0,.45);
}
.ability[disabled] { background: rgba(52,66,60,.85); }
.ability-cd {
  position: absolute; left: 0; right: 0; bottom: 0; height: 0%;
  background: rgba(0,0,0,.5); pointer-events: none;
}
.ability-label {
  position: relative; display: block; padding: 0 4px;
  font: 700 11px/1.15 ui-monospace, monospace; text-shadow: 0 1px 2px rgba(0,0,0,.7);
}`;
  }
}
