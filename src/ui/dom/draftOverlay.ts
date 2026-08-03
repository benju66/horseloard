import type { Perk } from '../../data/schemas';
import type { Simulation } from '../../engine/simulation';

/**
 * The in-run draft. **It never opens itself.**
 *
 * It used to. That was defensible when drafts came on wave clears — about
 * twelve a run, during the build phase, when nothing was happening. MG5.5 moved
 * them to level-ups: roughly thirty a run, mid-combat, while you are riding.
 * The panel was never revisited, and on device the result was damning — it is
 * `pointer-events: auto` across the bottom of the screen, which is where the
 * joystick spawns, so **every draft froze steering until it was dismissed**.
 * Thirty times a run, mid-fight.
 *
 * So the panel is now strictly opt-in: a level-up lights a badge, and the cards
 * appear only when the player asks for them. Nothing covers the field
 * uninvited, and the badge carries the count so banking three cards while
 * fighting is visible rather than silent.
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
  /** Starts closed and stays closed until the player opens it. */
  private dismissed = true;

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

    // The only way the panel ever opens. Deliberately small and out of the
    // joystick's way — it is an invitation, not an interruption.
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
      this.render(offer, sim);
      // A new offer badges; it does not barge in. `dismissed` starts true and
      // only the player clears it.
      if (!this.dismissed) {
        this.dismissed = true;
        this.panel.style.display = 'none';
      }
    }

    // Banked cards are worth showing — three waiting is a different situation
    // from one, and a player mid-fight has no other way to know.
    if (this.dismissed) {
      const queued = sim.perks?.queuedDrafts ?? 0;
      const label = queued > 0 ? `✦ Choose a boon (${queued + 1})` : '✦ Choose a boon';
      if (this.reopen.textContent !== label) this.reopen.textContent = label;
      this.reopen.style.display = '';
    }
  }

  private render(offer: readonly Perk[], sim: Simulation): void {
    this.cards.replaceChildren();
    for (const perk of offer) {
      const taken = sim.perks?.stacksOf(perk.id) ?? 0;

      const card = document.createElement('button');
      card.className = 'draft-card';
      card.setAttribute('data-ui', '');

      // The family tag is the offer rule made visible (TRIANGLE.md §B.5). Every
      // draft holds one hero card and one tower-or-army card; a player who
      // cannot see that is choosing between three anonymous upgrades, which is
      // the "preference, not decision" failure the whole pool was rebuilt to
      // avoid. Content-agnostic: the string comes from `perks.json`.
      const family = document.createElement('div');
      family.className = 'draft-card-family';
      family.dataset.family = perk.family;
      family.textContent = perk.family;

      const name = document.createElement('div');
      name.className = 'draft-card-name';
      name.textContent = perk.name;

      const desc = document.createElement('div');
      desc.className = 'draft-card-desc';
      desc.textContent = perk.description;

      card.append(family, name, desc);

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
        // Straight back to the field. If a card is queued behind this one it
        // badges again next frame rather than chaining panels at the player.
        this.dismissed = true;
        this.panel.style.display = 'none';
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
.draft-card-family {
  display: inline-block; margin-bottom: 5px; padding: 2px 7px; border-radius: 999px;
  font: 700 9px/1.4 ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase;
  color: #10201a; background: #9fb0c4;
}
/* One colour per pillar, plus two neutrals for the supports. The point is that
   two glances tell you the offer is balanced without reading a word. */
.draft-card-family[data-family="hero"]    { background: #9fd8ff; }
.draft-card-family[data-family="towers"]  { background: #f6c945; }
.draft-card-family[data-family="army"]    { background: #7fb2ff; }
.draft-card-family[data-family="economy"] { background: #8fe36a; }
.draft-card-family[data-family="keep"]    { background: #d7c3a2; }
.draft-card-name { font: 700 16px ui-monospace, monospace; color: #f2ecdd; }
.draft-card-desc { font: 400 13px/1.4 sans-serif; color: #b9c6d6; margin-top: 3px; }
.draft-card-stack { font: 600 11px ui-monospace, monospace; color: #f6c945; margin-top: 5px; }
.draft-later {
  margin-top: 10px; padding: 9px 20px; border-radius: 12px;
  border: 1px solid rgba(255,255,255,.2); background: transparent;
  color: #9fb0c4; font: 600 13px ui-monospace, monospace;
}
.draft-reopen {
  /* Top of the screen, under the XP bar that spawned it — NOT the bottom.
     The joystick spawns wherever a thumb lands, and the bottom half is where
     thumbs land; anything with pointer-events there steals steering. */
  position: fixed; left: 50%; transform: translateX(-50%);
  top: calc(env(safe-area-inset-top, 6px) + 50px); pointer-events: auto; z-index: 30;
  padding: 10px 18px; border-radius: 14px; border: 1px solid rgba(246,201,69,.5);
  background: rgba(30,44,60,.92); color: #f6c945; font: 700 14px ui-monospace, monospace;
}`;
  }
}
