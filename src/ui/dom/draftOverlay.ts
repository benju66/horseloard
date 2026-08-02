import type { Perk } from '../../data/schemas';
import type { Simulation } from '../../engine/simulation';

/**
 * The in-run draft: pick 1 of N on a wave clear (DESIGN §15.1).
 *
 * Deliberately does *not* block the game. The sim never entered a 'draft'
 * phase — the offer just sits in hand through the build phase — so this panel
 * is dismissable and the field stays visible and playable behind it. A player
 * who wants to ride out and sweep coins first can, and the cards are still
 * there when they come back.
 *
 * Content-agnostic: every string on a card comes from `perks.json`. This file
 * has never heard of a bow.
 */
export class DraftOverlay {
  private readonly panel: HTMLDivElement;
  private readonly cards: HTMLDivElement;
  private readonly reopen: HTMLButtonElement;
  /** The offer currently rendered, so we only rebuild when it actually changes. */
  private shownFor: string | null = null;
  private dismissed = false;

  constructor(layer: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'draft-panel';
    this.panel.style.display = 'none';

    const title = document.createElement('div');
    title.className = 'draft-title';
    title.textContent = 'The road provides';

    const sub = document.createElement('div');
    sub.className = 'draft-sub';
    sub.textContent = 'Choose one';

    this.cards = document.createElement('div');
    this.cards.className = 'draft-cards';

    const later = document.createElement('button');
    later.className = 'draft-later';
    later.setAttribute('data-ui', '');
    later.textContent = 'Decide later';
    later.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.dismissed = true;
      this.panel.style.display = 'none';
      this.reopen.style.display = '';
    });

    this.panel.append(title, sub, this.cards, later);

    // A dismissed draft has to be reachable again, or "decide later" is just a
    // way to lose the card by accident.
    this.reopen = document.createElement('button');
    this.reopen.className = 'draft-reopen';
    this.reopen.setAttribute('data-ui', '');
    this.reopen.textContent = '✦ Choose a boon';
    this.reopen.style.display = 'none';
    this.reopen.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.dismissed = false;
      this.reopen.style.display = 'none';
      this.panel.style.display = '';
    });

    layer.append(this.panel, this.reopen);
  }

  /** Call every frame. Renders whatever the sim currently offers. */
  sync(sim: Simulation): void {
    const offer = sim.perks?.offer ?? null;

    if (!offer || offer.length === 0) {
      if (this.shownFor !== null) {
        this.shownFor = null;
        this.dismissed = false;
        this.panel.style.display = 'none';
        this.reopen.style.display = 'none';
      }
      return;
    }

    const key = offer.map((p) => p.id).join('|');
    if (key !== this.shownFor) {
      this.shownFor = key;
      this.dismissed = false;
      this.render(offer, sim);
      this.panel.style.display = '';
      this.reopen.style.display = 'none';
    }
  }

  private render(offer: readonly Perk[], sim: Simulation): void {
    this.cards.replaceChildren();
    for (const perk of offer) {
      const taken = sim.perks?.stacksOf(perk.id) ?? 0;

      const card = document.createElement('button');
      card.className = 'draft-card';
      card.setAttribute('data-ui', '');

      const name = document.createElement('div');
      name.className = 'draft-card-name';
      name.textContent = perk.name;

      const desc = document.createElement('div');
      desc.className = 'draft-card-desc';
      desc.textContent = perk.description;

      card.append(name, desc);

      // Show the stack state only once something is stacked — a "0/3" on every
      // card is noise on a first draft.
      if (perk.maxStacks > 1 && taken > 0) {
        const stack = document.createElement('div');
        stack.className = 'draft-card-stack';
        stack.textContent = `${taken}/${perk.maxStacks} taken`;
        card.append(stack);
      }

      card.addEventListener('click', (ev) => {
        ev.stopPropagation();
        sim.perks?.take(perk.id);
      });
      this.cards.append(card);
    }
  }

  static css(): string {
    return `
/* Explicit stacking: every other overlay relies on DOM order, and the ability
   bar is built per-run so it mounts *after* this panel and would punch through
   the cards. This is the only z-index in the UI layer — keep it that way. */
.draft-panel {
  position: fixed; left: 0; right: 0; bottom: 0; pointer-events: auto; z-index: 30;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 18px 14px calc(env(safe-area-inset-bottom, 12px) + 16px);
  background: linear-gradient(to top, rgba(10,18,26,.97) 62%, rgba(10,18,26,0));
}
.draft-title { font: 700 22px Georgia, serif; color: #f6c945; }
.draft-sub { font: 400 12px sans-serif; color: #9fb0c4; margin-bottom: 8px; }
.draft-cards { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 380px; }
.draft-card {
  display: block; width: 100%; text-align: left; pointer-events: auto;
  padding: 12px 14px; border-radius: 14px;
  border: 1px solid rgba(246,201,69,.35); background: rgba(30,44,60,.92);
}
.draft-card:active { background: rgba(46,66,86,.95); }
.draft-card-name { font: 700 16px ui-monospace, monospace; color: #f2ecdd; }
.draft-card-desc { font: 400 13px/1.4 sans-serif; color: #b9c6d6; margin-top: 3px; }
.draft-card-stack { font: 600 11px ui-monospace, monospace; color: #f6c945; margin-top: 5px; }
.draft-later {
  margin-top: 10px; padding: 9px 20px; border-radius: 12px;
  border: 1px solid rgba(255,255,255,.2); background: transparent;
  color: #9fb0c4; font: 600 13px ui-monospace, monospace;
}
.draft-reopen {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom, 12px) + 74px); pointer-events: auto; z-index: 30;
  padding: 10px 18px; border-radius: 14px; border: 1px solid rgba(246,201,69,.5);
  background: rgba(30,44,60,.92); color: #f6c945; font: 700 14px ui-monospace, monospace;
}`;
  }
}
