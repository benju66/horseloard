import type { Simulation } from '../../engine/simulation';
import type { MapDef } from '../../data/schemas';

/**
 * Contextual world-space bubbles, DOM overlay edition: ride close → bubble
 * appears → tap. Zero UI literacy required (DESIGN §9).
 *
 * A faithful port of GameScene's logic, including the reach constants and the
 * nearest-thing-wins precedence between plot / forge / gate. That behaviour was
 * validated in the prototype and again in the Phaser build; the only thing that
 * changes here is that the bubbles are divs positioned by world→screen
 * projection instead of canvas containers in world space.
 */

const FORGE_REACH = 55;
const PLOT_REACH = 52;
const GATE_REACH = 64;
const MAX_BUBBLES = 4;

export interface BubbleAction {
  title: string;
  sub: string;
  enabled: boolean;
  /** world-space anchor in SIM coordinates */
  x: number;
  y: number;
  run(): void;
}

/**
 * Decide which bubbles should exist this frame. Pure — returns descriptions,
 * renders nothing, so it can be unit-tested without a DOM.
 */
export function bubbleActions(sim: Simulation, map: MapDef): BubbleAction[] {
  const hero = sim.hero;
  const sys = sim.towerSystem;
  const gold = sim.gold;

  let nearestPlot: (typeof sys.plots)[number] | null = null;
  let nearestPlotDist = PLOT_REACH;
  for (const plot of sys.plots) {
    const d = Math.hypot(hero.x - plot.x, hero.y - plot.y);
    if (d < nearestPlotDist) {
      nearestPlotDist = d;
      nearestPlot = plot;
    }
  }
  const forge = map.forge.position;
  const forgeDist = Math.hypot(hero.x - forge.x, hero.y - forge.y);
  const gate = map.gate.position;
  const gateDist = Math.hypot(hero.x - gate.x, hero.y - gate.y);

  const out: BubbleAction[] = [];
  const push = (x: number, y: number, title: string, sub: string, enabled: boolean, run: () => void) => {
    if (out.length >= MAX_BUBBLES) return;
    out.push({ title, sub, enabled, x, y, run });
  };

  if (nearestPlot && nearestPlotDist <= forgeDist && nearestPlotDist <= gateDist) {
    const plot = nearestPlot;
    if (plot.towerId === null) {
      for (const tower of sys.roster) {
        // The price, not the list cost — rule `first-tower-free` makes the first
        // build of each phase cost nothing, and a bubble quoting the list price
        // would have the player saving up for something already free.
        const cost = sim.buildPrice(tower.id) ?? 0;
        push(
          plot.x,
          plot.y,
          `Build ${tower.name}`,
          cost === 0 ? 'free' : `${cost} gold`,
          gold >= cost,
          () => sim.buildTower(plot.plotId, tower.id),
        );
      }
      return out;
    }
    const upgradeCost = sys.upgradeCost(plot);
    if (upgradeCost !== null) {
      push(plot.x, plot.y, `Upgrade Lv${plot.level + 1}`, `${upgradeCost} gold`, gold >= upgradeCost, () =>
        sim.upgradeTower(plot.plotId),
      );
    }
    for (const branch of sys.branchOptions(plot)) {
      push(plot.x, plot.y, branch.name, `${branch.cost} gold`, gold >= branch.cost, () =>
        sim.branchTower(plot.plotId, branch.id),
      );
    }
    const refund = sys.sellRefund(plot, sim.economy.config.sellRefund);
    push(plot.x, plot.y, 'Sell', `+${refund} gold`, true, () => sim.sellTower(plot.plotId));
    return out;
  }

  if (forgeDist < FORGE_REACH && forgeDist <= gateDist) {
    const cost = sim.hero.nextBowCost();
    if (cost !== null) {
      push(forge.x, forge.y, `Bow Lv${sim.hero.bowLevel + 1}`, `${cost} gold`, gold >= cost, () =>
        sim.buyBowUpgrade(),
      );
    }
    return out;
  }

  if (gateDist < GATE_REACH) {
    const quote = sim.repairQuote();
    if (quote && sim.phase === 'build') {
      push(gate.x, gate.y, `Repair +${quote.amount}`, `${quote.cost} gold`, gold >= quote.cost, () =>
        sim.repairGate(),
      );
    }
  }
  return out;
}

interface PooledBubble {
  button: HTMLButtonElement;
  title: HTMLSpanElement;
  sub: HTMLSpanElement;
  /** rebound each frame; kept off the element so listeners are attached once */
  action: BubbleAction | null;
}

/** Pooled DOM bubbles positioned from projected screen coordinates. */
export class BubbleLayer {
  private readonly pool: PooledBubble[] = [];
  private readonly layer: HTMLElement;

  constructor(layer: HTMLElement) {
    this.layer = layer;
  }

  private grow(): PooledBubble {
    const button = document.createElement('button');
    button.className = 'bubble';
    button.setAttribute('data-ui', '');
    const title = document.createElement('span');
    title.className = 'bubble-t';
    const sub = document.createElement('span');
    sub.className = 'bubble-s';
    button.append(title, sub);

    // Structure and listener are created once. Rebuilding children per frame
    // (which an innerHTML assignment does) would churn the DOM every tick.
    const entry: PooledBubble = { button, title, sub, action: null };
    button.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (entry.action?.enabled) entry.action.run();
    });
    this.layer.append(button);
    this.pool.push(entry);
    return entry;
  }

  /**
   * Hide everything. The render loop stops calling `render` the moment the
   * sim is gone, so without this the last frame's bubbles stay wherever they
   * were — invisible behind the map select, then flashing over the next run's
   * first frame.
   */
  clear(): void {
    for (const entry of this.pool) {
      entry.button.style.display = 'none';
      entry.action = null;
    }
  }

  /** @param screens one {x,y} in CSS pixels per action, same order */
  render(actions: readonly BubbleAction[], screens: readonly { x: number; y: number }[]): void {
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i]!;
      const s = screens[i]!;
      const entry = this.pool[i] ?? this.grow();
      entry.action = a;
      entry.button.style.display = '';
      entry.button.style.transform = `translate(${s.x}px, ${s.y + i * 54}px) translate(-50%, -50%)`;
      if (entry.title.textContent !== a.title) entry.title.textContent = a.title;
      if (entry.sub.textContent !== a.sub) entry.sub.textContent = a.sub;
      entry.button.disabled = !a.enabled;
    }
    for (let i = actions.length; i < this.pool.length; i++) {
      const entry = this.pool[i]!;
      entry.button.style.display = 'none';
      entry.action = null;
    }
  }

  static css(): string {
    return `
.bubble {
  position: fixed; left: 0; top: 0; pointer-events: auto;
  min-width: 118px; padding: 7px 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,.2);
  background: rgba(28,40,34,.9); color: #f2ecdd; text-align: center;
  display: flex; flex-direction: column; gap: 1px; will-change: transform;
  box-shadow: 0 3px 10px rgba(0,0,0,.45);
}
.bubble[disabled] { opacity: .4; }
.bubble-t { font: 700 13px ui-monospace, monospace; }
.bubble-s { font: 600 11px ui-monospace, monospace; color: #f6c945; }`;
  }
}
