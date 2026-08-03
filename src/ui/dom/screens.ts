import type { GameData } from '../../data/loader';
import type { Ability, SkillPath } from '../../data/schemas';
import { SkillTree, type AllocationRefusal } from '../../engine/skillTree';
import {
  careerProgress,
  equipSlots,
  threeStarredMaps,
  unlockedMapIds,
  type SaveData,
} from '../../engine/progression';

/**
 * Map select and the career tree, DOM overlay edition.
 *
 * Both screens are pure presentation over the engine — unlock rules, point
 * costs, prerequisites and the respec all live in `progression.ts` and
 * `skillTree.ts` and are tested there. Nothing here decides anything; it
 * renders decisions and reports taps back to the host.
 */

export interface ScreenHost {
  data: GameData;
  save: SaveData;
  onPlay(mapId: string, endless: boolean): void;
  onSaveChanged(save: SaveData): void;
}

/** Column headers. Order is the read order; the data's `path` enum is unordered. */
const PATH_ORDER: readonly SkillPath[] = ['hunt', 'ride', 'wall', 'host', 'crown'];
const PATH_TITLES: Record<SkillPath, string> = {
  hunt: 'The Hunt',
  ride: 'The Ride',
  wall: 'The Wall',
  host: 'The Host',
  crown: 'The Crown',
};
const PATH_BLURBS: Record<SkillPath, string> = {
  hunt: 'Bow, crit, arrows from above',
  ride: 'Speed, trample, steel in motion',
  wall: 'Towers — rate, reach, range',
  host: 'Soldiers holding the road',
  crown: 'Gold, the gate, the long game',
};

/** Why a node is greyed out, in words a player can act on. */
const REFUSAL_TEXT: Record<AllocationRefusal, string> = {
  unknown: 'missing',
  'already-taken': 'taken',
  'missing-prerequisite': 'locked',
  excluded: 'forgone',
  'too-expensive': 'not enough points',
};

export class MapSelectScreen {
  private readonly root: HTMLDivElement;
  private readonly host: ScreenHost;

  constructor(
    layer: HTMLElement,
    host: ScreenHost,
    openTree: () => void,
    openLoadout: () => void,
  ) {
    this.host = host;
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.style.display = 'none';
    layer.append(this.root);
    this.openTree = openTree;
    this.openLoadout = openLoadout;
  }

  private readonly openTree: () => void;
  private readonly openLoadout: () => void;

  show(): void {
    this.render();
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  private render(): void {
    const { data, save } = this.host;
    const maps = Object.values(data.maps).sort((a, b) => a.order - b.order);
    const unlocked = unlockedMapIds(save, maps);

    this.root.replaceChildren();

    const title = document.createElement('h1');
    title.className = 'screen-title';
    title.textContent = 'HORSE LORD';
    const tree = new SkillTree(data.skillTree);
    const { level } = careerProgress(save.careerXp, data.economy, data.skillTree.maxLevel);
    const free = tree.pointsAt(level, threeStarredMaps(save)) - tree.spent(save.build);
    const sub = document.createElement('div');
    sub.className = 'screen-sub';
    // Unspent points lead, because that is the number that pulls a player back
    // into the tree. Level alone reads as a badge; "3 points" reads as a task.
    sub.textContent = free > 0 ? `LV ${level} · ${free} points to spend` : `LV ${level}`;
    this.root.append(title, sub);

    const list = document.createElement('div');
    list.className = 'map-list';
    for (const map of maps) {
      const open = unlocked.has(map.id);
      const entry = save.campaign[map.id];
      const stars = entry?.stars ?? 0;

      const row = document.createElement('button');
      row.className = 'map-row';
      row.setAttribute('data-ui', '');
      row.disabled = !open;

      const name = document.createElement('div');
      name.className = 'map-name';
      name.textContent = open ? map.name : '🔒 Locked';
      const desc = document.createElement('div');
      desc.className = 'map-desc';
      desc.textContent = open ? map.description : 'Clear the previous road';
      const rating = document.createElement('div');
      rating.className = 'map-stars';
      rating.textContent = open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';

      row.append(name, desc, rating);
      if (open) row.addEventListener('click', () => this.host.onPlay(map.id, false));

      // Endless unlocks per map once its campaign run is cleared — same rule the
      // Phaser build used. A button cannot nest inside a button, so the row and
      // the endless control are siblings in a flex pair rather than parent and
      // child.
      if (open && entry?.completed) {
        const pair = document.createElement('div');
        pair.className = 'map-pair';

        const endless = document.createElement('button');
        endless.className = 'map-endless';
        endless.setAttribute('data-ui', '');
        endless.title = 'Endless — waves never stop';

        const symbol = document.createElement('div');
        symbol.className = 'map-endless-mark';
        symbol.textContent = '∞';
        const best = save.endlessBest[map.id] ?? 0;
        const label = document.createElement('div');
        label.className = 'map-endless-best';
        label.textContent = best > 0 ? `best ${best}` : 'endless';

        endless.append(symbol, label);
        endless.addEventListener('click', () => this.host.onPlay(map.id, true));
        pair.append(row, endless);
        list.append(pair);
        continue;
      }

      list.append(row);
    }
    this.root.append(list);

    const actions = document.createElement('div');
    actions.className = 'screen-actions';

    const meta = document.createElement('button');
    meta.className = 'screen-action' + (free > 0 ? '' : ' ghost');
    meta.setAttribute('data-ui', '');
    meta.textContent = free > 0 ? `Skill tree · ${free} ⬢` : 'Skill tree';
    meta.addEventListener('click', () => this.openTree());

    const bar = document.createElement('button');
    bar.className = 'screen-action ghost';
    bar.setAttribute('data-ui', '');
    bar.textContent = 'Loadout';
    bar.addEventListener('click', () => this.openLoadout());

    actions.append(meta, bar);
    this.root.append(actions);
  }
}

/**
 * The career tree (SKILLTREE.md Part E).
 *
 * Five vertical columns, one path per phone screen, swiped sideways. A path
 * reads top to bottom as a single line of commitment — which is the shape a
 * phone actually wants. The alternative, a 2D graph you pan and zoom, is how
 * every desktop skill tree looks and is unusable with one thumb.
 *
 * All the rules live in `SkillTree`; this renders them. In particular the
 * refusal reason is asked for by name rather than reduced to a boolean, because
 * "locked" with no explanation is the thing that makes players stop reading a
 * tree.
 */
export class SkillTreeScreen {
  private readonly root: HTMLDivElement;
  private readonly host: ScreenHost;
  private readonly onBack: () => void;
  private readonly tree: SkillTree;
  private readonly columns: HTMLDivElement;

  constructor(layer: HTMLElement, host: ScreenHost, onBack: () => void) {
    this.host = host;
    this.onBack = onBack;
    this.tree = new SkillTree(host.data.skillTree);
    this.root = document.createElement('div');
    this.root.className = 'screen tree-screen';
    this.root.style.display = 'none';
    this.columns = document.createElement('div');
    this.columns.className = 'tree-columns';
    layer.append(this.root);
  }

  show(): void {
    this.render();
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  /** Points the career has earned, and what is left after the current build. */
  private budget(): { level: number; earned: number; spent: number; free: number } {
    const { save, data } = this.host;
    const { level } = careerProgress(save.careerXp, data.economy, data.skillTree.maxLevel);
    const earned = this.tree.pointsAt(level, threeStarredMaps(save));
    const spent = this.tree.spent(save.build);
    return { level, earned, spent, free: earned - spent };
  }

  private render(): void {
    const { save, data } = this.host;
    const { level, earned, spent, free } = this.budget();
    const progress = careerProgress(save.careerXp, data.economy, data.skillTree.maxLevel);

    // Preserve the scroll position across re-renders. Every tap rebuilds the
    // list, and a column that jumps back to the top on each allocation makes
    // walking a path feel like fighting the screen.
    const scrollLeft = this.columns.scrollLeft;
    const scrollTops = [...this.columns.children].map((c) => c.scrollTop);

    this.root.replaceChildren();
    this.columns.replaceChildren();

    const header = document.createElement('div');
    header.className = 'tree-header';

    const title = document.createElement('div');
    title.className = 'tree-level';
    title.textContent = `LV ${level}`;

    const bar = document.createElement('div');
    bar.className = 'tree-xpbar';
    const fill = document.createElement('div');
    fill.className = 'tree-xpfill';
    fill.style.width =
      progress.needed > 0 ? `${Math.min(100, (progress.into / progress.needed) * 100)}%` : '100%';
    bar.append(fill);

    const points = document.createElement('div');
    points.className = 'tree-points' + (free > 0 ? ' has-free' : '');
    points.textContent = `${free} ⬢`;
    points.title = `${spent} spent of ${earned} earned`;

    const respec = document.createElement('button');
    respec.className = 'tree-respec';
    respec.setAttribute('data-ui', '');
    respec.textContent = 'Respec';
    // Free and always live (SKILLTREE.md C.6). A tree where a third of the
    // nodes are reachable and mistakes are permanent is a tree nobody
    // experiments with, which forfeits the point of having paths at all.
    respec.disabled = spent === 0;
    respec.addEventListener('click', () => {
      const next: SaveData = structuredClone(this.host.save);
      next.build = [...this.tree.respec()];
      this.host.onSaveChanged(next);
      this.render();
    });

    header.append(title, bar, points, respec);
    this.root.append(header);

    for (const path of PATH_ORDER) {
      this.columns.append(this.renderColumn(path, free));
    }
    this.root.append(this.columns);

    const back = document.createElement('button');
    back.className = 'screen-action';
    back.setAttribute('data-ui', '');
    back.textContent = 'Back';
    back.addEventListener('click', () => this.onBack());
    this.root.append(back);

    this.columns.scrollLeft = scrollLeft;
    [...this.columns.children].forEach((c, i) => {
      c.scrollTop = scrollTops[i] ?? 0;
    });
  }

  private renderColumn(path: SkillPath, free: number): HTMLDivElement {
    const { save } = this.host;
    const col = document.createElement('div');
    col.className = 'tree-col';

    const head = document.createElement('div');
    head.className = 'tree-col-head';
    const name = document.createElement('div');
    name.className = 'tree-col-name';
    name.textContent = PATH_TITLES[path];
    const blurb = document.createElement('div');
    blurb.className = 'tree-col-blurb';
    blurb.textContent = PATH_BLURBS[path];
    head.append(name, blurb);
    col.append(head);

    const nodes = this.tree.nodes
      .filter((n) => n.path === path)
      .slice()
      .sort((a, b) => a.row - b.row);

    for (const node of nodes) {
      const taken = save.build.includes(node.id);
      const state = { allocated: save.build, pointsEarned: this.budget().earned };
      const refusal = this.tree.refusal(node.id, state);

      const row = document.createElement('button');
      row.className = `tree-node kind-${node.kind}`;
      row.setAttribute('data-ui', '');
      if (taken) row.classList.add('taken');
      else if (refusal !== null) row.classList.add('locked');
      // A taken node stays live: tapping it refunds, which is the only way to
      // walk back up a path without nuking the whole build.
      row.disabled = !taken && refusal !== null;

      const nName = document.createElement('div');
      nName.className = 'tree-node-name';
      nName.textContent = node.name;
      const nDesc = document.createElement('div');
      // Keystone downsides are rendered in the *same* type as the upside —
      // a trade-off written in small print is a lie (SKILLTREE.md Part E).
      nDesc.className = 'tree-node-desc';
      nDesc.textContent = node.description;
      const nCost = document.createElement('div');
      nCost.className = 'tree-node-cost';
      nCost.textContent = taken
        ? `✓ ${node.cost} ⬢ · tap to refund`
        : refusal === null
          ? `${node.cost} ⬢`
          : `${node.cost} ⬢ · ${REFUSAL_TEXT[refusal]}`;

      row.append(nName, nDesc, nCost);
      row.addEventListener('click', () => {
        const next: SaveData = structuredClone(this.host.save);
        const fresh = { allocated: this.host.save.build, pointsEarned: this.budget().earned };
        next.build = [
          ...(taken
            ? this.tree.deallocate(node.id, fresh)
            : this.tree.allocate(node.id, fresh)),
        ];
        if (next.build.length === this.host.save.build.length) return;
        this.host.onSaveChanged(next);
        this.render();
      });
      col.append(row);
    }

    // A column that can afford nothing says so once, at the bottom, rather than
    // repeating "not enough points" on every row above it.
    if (free <= 0) col.classList.add('spent-out');
    return col;
  }
}

/**
 * The loadout: which of the unlocked abilities the hero actually carries.
 *
 * The equip cap is the structural bound on hero damage-per-minute (TRIANGLE
 * §B.3) — a cooldown bounds one ability, so the total is the sum over the bar.
 * That makes this screen the one place the cap is *felt*: unlocking a fourth
 * ability makes it a choice of three, never a fourth simultaneous one.
 */
export class LoadoutScreen {
  private readonly root: HTMLDivElement;
  private readonly host: ScreenHost;
  private readonly onBack: () => void;
  private readonly tree: SkillTree;

  constructor(layer: HTMLElement, host: ScreenHost, onBack: () => void) {
    this.host = host;
    this.onBack = onBack;
    this.tree = new SkillTree(host.data.skillTree);
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.style.display = 'none';
    layer.append(this.root);
  }

  show(): void {
    this.render();
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  /** Ability ids the build has unlocked, plus whatever starts unlocked. */
  private available(): string[] {
    const { data, save } = this.host;
    const granted = new Set(
      this.tree.applyTo(
        {
          hero: data.hero,
          economy: data.economy,
          towers: data.towers,
          map: Object.values(data.maps)[0]!,
          abilities: data.abilities,
        },
        save.build,
      ).unlockedAbilityIds,
    );
    return data.abilities.filter((a) => a.unlockedByDefault || granted.has(a.id)).map((a) => a.id);
  }

  private render(): void {
    const { data, save } = this.host;
    const slots = equipSlots(save, data.equipSlots, data.equipSlotGrants);
    const available = this.available();
    // A loadout may hold ids a respec has since taken away; drop them here so
    // the screen and the run agree about what is carried.
    const carried = save.loadout.filter((id) => available.includes(id)).slice(0, slots);
    const effective = carried.length > 0 ? carried : available.slice(0, slots);

    this.root.replaceChildren();

    const title = document.createElement('h1');
    title.className = 'screen-title';
    title.textContent = 'Loadout';
    const sub = document.createElement('div');
    sub.className = 'screen-sub';
    sub.textContent = `${effective.length}/${slots} carried · ${available.length} unlocked`;
    this.root.append(title, sub);

    const list = document.createElement('div');
    list.className = 'node-list';
    for (const id of available) {
      const ability = data.abilities.find((a) => a.id === id)!;
      const on = effective.includes(id);
      const full = effective.length >= slots;

      const row = document.createElement('button');
      row.className = 'node-row';
      row.setAttribute('data-ui', '');
      if (on) row.classList.add('carried');
      // A full bar leaves every unequipped row live-looking but inert, which
      // reads as a broken button. Grey them out and say why once, below.
      row.disabled = !on && full;

      const name = document.createElement('div');
      name.className = 'node-name';
      name.textContent = `${on ? '● ' : '○ '}${ability.name}`;
      const desc = document.createElement('div');
      desc.className = 'node-desc';
      desc.textContent = ability.description;
      const meta = document.createElement('div');
      meta.className = 'node-cost';
      meta.textContent = triggerText(ability.trigger, ability.cooldown);

      row.append(name, desc, meta);
      row.addEventListener('click', () => {
        const next: SaveData = structuredClone(this.host.save);
        next.loadout = on ? effective.filter((x) => x !== id) : [...effective, id];
        this.host.onSaveChanged(next);
        this.render();
      });
      list.append(row);
    }
    this.root.append(list);

    if (effective.length >= slots) {
      const note = document.createElement('div');
      note.className = 'screen-sub';
      note.textContent = 'Bar full — drop one to swap. More slots come from clearing maps.';
      this.root.append(note);
    }

    const back = document.createElement('button');
    back.className = 'screen-action';
    back.setAttribute('data-ui', '');
    back.textContent = 'Back';
    back.addEventListener('click', () => this.onBack());
    this.root.append(back);
  }
}

/** How an ability fires, in one line. Abilities are automatic — no button. */
function triggerText(trigger: Ability['trigger'], cooldown: number): string {
  const every = `every ${cooldown}s at most`;
  if (trigger.type === 'enemies-near') {
    return `${trigger.count}+ enemies within ${trigger.radius} · ${every}`;
  }
  if (trigger.type === 'damage-dealt') return `after ${trigger.amount} damage dealt · ${every}`;
  return `automatic · every ${cooldown}s`;
}

export function screensCss(): string {
  return `
.screen {
  position: fixed; inset: 0; pointer-events: auto; overflow-y: auto;
  background: #1a2618; color: #f5ead0; padding: 28px 18px 40px;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.screen-title { font: 700 32px/1.1 Georgia, serif; color: #f6c945; margin-top: env(safe-area-inset-top, 0px); }
.screen-sub { font: 600 14px ui-monospace, monospace; color: #cdc6b4; margin-bottom: 8px; }
.map-list, .node-list { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 400px; }
.map-row, .node-row {
  text-align: left; padding: 14px 16px; border-radius: 14px; pointer-events: auto;
  background: #24361f; border: 2px solid #59a844; color: #f5ead0;
  display: flex; flex-direction: column; gap: 3px;
}
.map-pair { display: flex; gap: 8px; align-items: stretch; }
.map-pair .map-row { flex: 1; min-width: 0; }
.map-endless {
  flex: 0 0 62px; border-radius: 14px; pointer-events: auto; padding: 6px 4px;
  background: #21384a; border: 2px solid #5f9fd4; color: #bfe0ff;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
}
.map-endless-mark { font: 400 26px Georgia, serif; line-height: 1; }
.map-endless-best { font: 700 9px ui-monospace, monospace; opacity: .9; }
.map-row[disabled], .node-row[disabled] { background: #1c2419; border-color: #333d30; color: #8a8f85; }
.map-name, .node-name { font: 700 17px Georgia, serif; }
.map-desc, .node-desc { font: 400 12px/1.35 sans-serif; opacity: .85; }
.map-stars { font: 700 16px monospace; color: #f6c945; }
.node-cost { font: 700 12px ui-monospace, monospace; color: #f6c945; }
.node-row[disabled] .node-cost { color: #8a8f85; }
.screen-action {
  margin-top: 14px; padding: 13px 28px; border-radius: 14px; border: 0; pointer-events: auto;
  background: rgba(46,120,120,.92); color: #f2ecdd; font: 700 15px ui-monospace, monospace;
}
.screen-action.ghost { background: transparent; border: 1px solid rgba(255,255,255,.25); }
.screen-actions { display: flex; gap: 10px; align-items: stretch; }
/* ─── Career tree: five columns, one path per screen, swipe sideways ─── */
.tree-screen { padding: 0; gap: 0; align-items: stretch; }
.tree-header {
  display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px;
  padding-top: calc(14px + env(safe-area-inset-top, 0px));
  background: #16210f; border-bottom: 1px solid rgba(255,255,255,.08); flex: 0 0 auto;
}
.tree-level { font: 700 15px ui-monospace, monospace; color: #f6c945; }
.tree-xpbar { flex: 1; height: 8px; border-radius: 5px; background: rgba(255,255,255,.12); overflow: hidden; }
.tree-xpfill { height: 100%; background: linear-gradient(90deg, #6fc34a, #f6c945); }
.tree-points { font: 700 15px ui-monospace, monospace; color: #8a8f85; }
.tree-points.has-free { color: #f6c945; }
.tree-respec {
  padding: 7px 12px; border-radius: 10px; pointer-events: auto;
  background: transparent; border: 1px solid rgba(255,255,255,.25); color: #f5ead0;
  font: 700 11px ui-monospace, monospace;
}
.tree-respec[disabled] { opacity: .35; }
/* One column fills the viewport and snaps; the row of columns is the swipe. */
.tree-columns {
  flex: 1 1 auto; display: flex; overflow-x: auto; overflow-y: hidden;
  scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
}
.tree-col {
  flex: 0 0 100%; scroll-snap-align: start; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 24px;
}
.tree-col-head { padding: 2px 0 6px; }
.tree-col-name { font: 700 22px/1.1 Georgia, serif; color: #f6c945; }
.tree-col-blurb { font: 400 12px sans-serif; color: #cdc6b4; opacity: .8; }
.tree-node {
  text-align: left; padding: 11px 13px; border-radius: 12px; pointer-events: auto;
  background: #24361f; border: 2px solid #59a844; color: #f5ead0;
  display: flex; flex-direction: column; gap: 2px;
}
.tree-node.taken { background: #2f4a26; border-color: #f6c945; }
.node-row.carried { background: #2f4a26; border-color: #f6c945; }
.tree-node.locked, .tree-node[disabled] { background: #1c2419; border-color: #333d30; color: #8a8f85; }
.tree-node-name { font: 700 15px Georgia, serif; }
.tree-node-desc { font: 400 12px/1.35 sans-serif; opacity: .9; }
.tree-node-cost { font: 700 11px ui-monospace, monospace; color: #f6c945; margin-top: 2px; }
.tree-node[disabled] .tree-node-cost { color: #8a8f85; }
/* Keystones are visibly the end of a path — bigger, and the trade-off is not
   in smaller type than the upside. */
.tree-node.kind-keystone { padding: 15px 15px; border-width: 3px; border-color: #d98b3a; margin-top: 6px; }
.tree-node.kind-keystone .tree-node-name { font-size: 19px; color: #ffce6b; }
.tree-node.kind-keystone .tree-node-desc { font-size: 13px; }
.tree-node.kind-keystone.taken { border-color: #ffce6b; background: #4a3520; }
.tree-node.kind-ability { border-style: dashed; }
.tree-node.kind-synergy { border-color: #5f9fd4; }
.tree-screen .screen-action { margin: 0 16px calc(14px + env(safe-area-inset-bottom, 0px)); flex: 0 0 auto; }`;
}
