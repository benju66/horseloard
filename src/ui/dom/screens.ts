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
// Hero columns first, then kingdom — the swipe crosses the pool boundary once,
// so "which budget am I spending" is a position on the screen and not a lookup.
const PATH_ORDER: readonly SkillPath[] = ['hunt', 'ride', 'storm', 'wall', 'host', 'crown'];
const PATH_TITLES: Record<SkillPath, string> = {
  hunt: 'The Hunt',
  ride: 'The Ride',
  storm: 'The Storm',
  wall: 'The Wall',
  host: 'The Host',
  crown: 'The Crown',
};
const PATH_BLURBS: Record<SkillPath, string> = {
  hunt: 'Bow, crit, arrows from above',
  ride: 'Speed, trample, steel in motion',
  storm: 'Caltrops, aerostorm, the ground itself',
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
    const freeTotal = tree.free(save.build, tree.pointsAt(level, threeStarredMaps(save)));
    const sub = document.createElement('div');
    sub.className = 'screen-sub';
    // Unspent points lead, because that is the number that pulls a player back
    // into the tree. Level alone reads as a badge; "3 points" reads as a task.
    sub.textContent =
      freeTotal > 0
        ? `LV ${level} · ${freeTotal} point${freeTotal > 1 ? 's' : ''} to spend`
        : `LV ${level}`;
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
    meta.className = 'screen-action' + (freeTotal > 0 ? '' : ' ghost');
    meta.setAttribute('data-ui', '');
    meta.textContent = freeTotal > 0 ? `Skill tree · ${freeTotal} ⬢` : 'Skill tree';
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
 * The career tree — a graph, not a list.
 *
 * Hex tiles with a glyph, wired together by elbow connectors that show what
 * unlocks what, on a vertically scrolling board with tabs across the top. The
 * first version of this screen was a column of text rows; it was technically a
 * tree and read as a settings menu. **A skill tree has to be legible as a
 * shape** — you should be able to see the fork coming three rows before you
 * reach it — and that is a picture, not a list.
 *
 * Two levels of navigation, because six paths is too many tabs for a phone:
 * a Hero/Kingdom segmented control (which is also the two point budgets), then
 * three path tabs under it. The pool you are spending is therefore always the
 * left/right position of a control you just touched.
 *
 * All the rules live in `SkillTree`; this renders them. The refusal reason is
 * asked for by name rather than reduced to a boolean, because "locked" with no
 * explanation is what makes players stop reading a tree.
 */
export class SkillTreeScreen {
  private readonly root: HTMLDivElement;
  private readonly host: ScreenHost;
  private readonly onBack: () => void;
  private readonly tree: SkillTree;
  private readonly board: HTMLDivElement;
  private pool: string;
  private path: SkillPath;
  /** Node the detail sheet is showing, or null when it is closed. */
  private selected: string | null = null;

  constructor(layer: HTMLElement, host: ScreenHost, onBack: () => void) {
    this.host = host;
    this.onBack = onBack;
    this.tree = new SkillTree(host.data.skillTree);
    this.pool = this.tree.pools[0]!;
    this.path = this.pathsIn(this.pool)[0]!;
    this.root = document.createElement('div');
    this.root.className = 'screen tree-screen';
    this.root.style.display = 'none';
    this.board = document.createElement('div');
    this.board.className = 'tree-board';
    layer.append(this.root);
  }

  show(): void {
    this.render();
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  private pathsIn(pool: string): SkillPath[] {
    return PATH_ORDER.filter((p) => this.tree.nodes.some((n) => n.path === p && n.pool === pool));
  }

  /** Points the career has earned, and what is left after the build. */
  private budget(): { level: number; earned: number; spent: number; free: number } {
    const { save, data } = this.host;
    const { level } = careerProgress(save.careerXp, data.economy, data.skillTree.maxLevel);
    const earned = this.tree.pointsAt(level, threeStarredMaps(save));
    return {
      level,
      earned,
      spent: this.tree.spent(save.build),
      free: this.tree.free(save.build, earned),
    };
  }

  private render(): void {
    const { save, data } = this.host;
    const { level, earned, spent, free } = this.budget();
    const progress = careerProgress(save.careerXp, data.economy, data.skillTree.maxLevel);

    const scrollTop = this.board.scrollTop;
    this.root.replaceChildren();
    this.board.replaceChildren();

    // ── Header: level, XP bar, one point counter per pool, respec ──
    const header = document.createElement('div');
    header.className = 'tree-header';

    const back = document.createElement('button');
    back.className = 'tree-back';
    back.setAttribute('data-ui', '');
    back.textContent = '←';
    back.addEventListener('click', () => this.onBack());

    const lvl = document.createElement('div');
    lvl.className = 'tree-level';
    lvl.textContent = `LV ${level}`;

    const bar = document.createElement('div');
    bar.className = 'tree-xpbar';
    const fill = document.createElement('div');
    fill.className = 'tree-xpfill';
    fill.style.width =
      progress.needed > 0 ? `${Math.min(100, (progress.into / progress.needed) * 100)}%` : '100%';
    bar.append(fill);

    const respec = document.createElement('button');
    respec.className = 'tree-respec';
    respec.setAttribute('data-ui', '');
    respec.textContent = '↺';
    respec.title = 'Respec — free, always';
    respec.disabled = spent === 0;
    respec.addEventListener('click', () => {
      const next: SaveData = structuredClone(this.host.save);
      next.build = [...this.tree.respec()];
      this.host.onSaveChanged(next);
      this.selected = null;
      this.render();
    });

    header.append(back, lvl, bar, respec);
    this.root.append(header);

    // ── Halves: navigation only. Six paths is too many tabs for a phone, so
    // this splits them three and three. It does not gate anything — one budget,
    // spent wherever you like.
    const pools = document.createElement('div');
    pools.className = 'tree-pools';
    for (const pool of this.tree.pools) {
      const btn = document.createElement('button');
      btn.className = `tree-pooltab pool-${pool}` + (pool === this.pool ? ' on' : '');
      btn.setAttribute('data-ui', '');
      btn.append(document.createTextNode(this.tree.poolName(pool)));
      btn.addEventListener('click', () => {
        this.pool = pool;
        if (!this.pathsIn(pool).includes(this.path)) this.path = this.pathsIn(pool)[0]!;
        this.selected = null;
        this.render();
      });
      pools.append(btn);
    }
    this.root.append(pools);

    // ── Path tabs for the active pool ──
    const tabs = document.createElement('div');
    tabs.className = 'tree-tabs';
    for (const path of this.pathsIn(this.pool)) {
      const btn = document.createElement('button');
      btn.className = 'tree-tab' + (path === this.path ? ' on' : '');
      btn.setAttribute('data-ui', '');
      btn.textContent = PATH_TITLES[path];
      btn.addEventListener('click', () => {
        this.path = path;
        this.selected = null;
        this.render();
      });
      tabs.append(btn);
    }
    this.root.append(tabs);

    this.renderBoard(free);
    this.root.append(this.board);
    this.board.scrollTop = scrollTop;

    if (this.selected) this.root.append(this.renderSheet(this.selected, free));
  }

  /**
   * The board: nodes laid out on a row/column grid, connectors drawn beneath.
   *
   * Positions are computed here rather than authored in the data — a node knows
   * its row and its prerequisites, and where it *sits* is a rendering decision.
   * Authoring x/y in JSON would mean every content edit is also a layout edit.
   */
  private renderBoard(free: number): void {
    const nodes = this.tree.nodes.filter((n) => n.path === this.path);
    const rows = [...new Set(nodes.map((n) => n.row))].sort((a, b) => a - b);

    // Column index per node: nodes sharing a row spread evenly across the width.
    const COLS = Math.max(...rows.map((r) => nodes.filter((n) => n.row === r).length));
    const pos = new Map<string, { col: number; row: number; span: number }>();
    for (const row of rows) {
      const inRow = nodes.filter((n) => n.row === row).sort((a, b) => (a.id < b.id ? -1 : 1));
      inRow.forEach((n, i) => pos.set(n.id, { col: i, row, span: inRow.length }));
    }

    const CELL_W = 100 / COLS;
    const ROW_H = 118;
    const x = (id: string) => {
      const p = pos.get(id)!;
      // Centre within the row's own share of the width, so a lone node on a row
      // sits on the spine and a pair straddles it.
      return ((p.col + 0.5) / p.span) * 100;
    };
    const y = (id: string) => rows.indexOf(pos.get(id)!.row) * ROW_H + 46;

    const height = rows.length * ROW_H + 40;
    const canvas = document.createElement('div');
    canvas.className = 'tree-canvas';
    canvas.style.height = `${height}px`;

    // Connectors first, so tiles sit on top of them.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tree-wires');
    svg.setAttribute('viewBox', `0 0 100 ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const node of nodes) {
      for (const req of node.requires) {
        if (!pos.has(req)) continue;
        const held = this.host.save.build.includes(req);
        const x1 = x(req);
        const y1 = y(req) + 34;
        const x2 = x(node.id);
        const y2 = y(node.id) - 34;
        const mid = (y1 + y2) / 2;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        // Orthogonal elbows: down, across, down. Reads as circuitry rather than
        // as a web, which is what makes a branch visible from a row away.
        line.setAttribute('d', `M ${x1} ${y1} L ${x1} ${mid} L ${x2} ${mid} L ${x2} ${y2}`);
        line.setAttribute('class', 'tree-wire' + (held ? ' live' : ''));
        svg.append(line);
      }
    }
    canvas.append(svg);

    for (const node of nodes) {
      const taken = this.host.save.build.includes(node.id);
      const refusal = this.tree.refusal(node.id, {
        allocated: this.host.save.build,
        pointsEarned: this.budget().earned,
      });
      const state = taken ? 'taken' : refusal === null ? 'open' : refusal === 'excluded' ? 'forgone' : 'locked';

      const cell = document.createElement('button');
      cell.className = `tree-cell kind-${node.kind} is-${state}` + (this.selected === node.id ? ' sel' : '');
      cell.setAttribute('data-ui', '');
      cell.style.left = `${x(node.id)}%`;
      cell.style.top = `${y(node.id)}px`;

      const hex = document.createElement('span');
      hex.className = 'tree-hex';
      hex.textContent = node.icon;

      const badge = document.createElement('span');
      badge.className = 'tree-badge';
      badge.textContent = taken ? '✓' : `${node.cost}`;

      const label = document.createElement('span');
      label.className = 'tree-cell-name';
      label.textContent = node.name;

      cell.append(hex, badge, label);
      cell.addEventListener('click', () => {
        this.selected = this.selected === node.id ? null : node.id;
        this.render();
      });
      canvas.append(cell);
    }

    this.board.append(canvas);
    void free;
  }

  /**
   * The detail sheet. Descriptions live here rather than on the tiles, because
   * a board carrying 12 paragraphs stops being a board.
   */
  private renderSheet(id: string, free: number): HTMLDivElement {
    const node = this.tree.node(id)!;
    const taken = this.host.save.build.includes(id);
    const refusal = this.tree.refusal(id, {
      allocated: this.host.save.build,
      pointsEarned: this.budget().earned,
    });

    const sheet = document.createElement('div');
    sheet.className = `tree-sheet kind-${node.kind}`;

    const head = document.createElement('div');
    head.className = 'tree-sheet-head';
    const ico = document.createElement('span');
    ico.className = 'tree-sheet-icon';
    ico.textContent = node.icon;
    const titles = document.createElement('div');
    const nm = document.createElement('div');
    nm.className = 'tree-sheet-name';
    nm.textContent = node.name;
    const kind = document.createElement('div');
    kind.className = 'tree-sheet-kind';
    kind.textContent = `${node.kind} · ${node.cost} point${node.cost > 1 ? 's' : ''}`;
    titles.append(nm, kind);
    head.append(ico, titles);

    const desc = document.createElement('div');
    desc.className = 'tree-sheet-desc';
    desc.textContent = node.description;

    const act = document.createElement('button');
    act.className = 'tree-sheet-act';
    act.setAttribute('data-ui', '');
    if (taken) {
      act.textContent = 'Refund';
      act.classList.add('ghost');
    } else if (refusal === null) {
      act.textContent = `Learn · ${node.cost} ⬢`;
    } else {
      act.textContent = REFUSAL_TEXT[refusal];
      act.disabled = true;
    }
    act.addEventListener('click', () => {
      const fresh = { allocated: this.host.save.build, pointsEarned: this.budget().earned };
      const next: SaveData = structuredClone(this.host.save);
      next.build = [...(taken ? this.tree.deallocate(id, fresh) : this.tree.allocate(id, fresh))];
      if (next.build.length === this.host.save.build.length) return;
      this.host.onSaveChanged(next);
      this.render();
    });

    sheet.append(head, desc, act);
    void free;
    return sheet;
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
/* ─── Career tree: a node graph on a scrolling board ─── */
.tree-screen { padding: 0; gap: 0; align-items: stretch; background: #1b2416; }
.tree-header {
  display: flex; align-items: center; gap: 10px; padding: 12px 14px 10px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  background: #141d10; flex: 0 0 auto;
}
.tree-back, .tree-respec {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 10px; pointer-events: auto;
  background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16);
  color: #f5ead0; font: 700 16px ui-monospace, monospace; line-height: 1;
}
.tree-respec[disabled] { opacity: .3; }
.tree-level { font: 700 14px ui-monospace, monospace; color: #f6c945; }
.tree-xpbar { flex: 1; height: 7px; border-radius: 4px; background: rgba(255,255,255,.12); overflow: hidden; }
.tree-xpfill { height: 100%; background: linear-gradient(90deg, #6fc34a, #f6c945); }

/* Pool = budget. Two chips, always both, always this order. */
.tree-pools { display: flex; gap: 8px; padding: 0 14px 10px; background: #141d10; flex: 0 0 auto; }
.tree-pooltab {
  flex: 1; padding: 9px 10px; border-radius: 11px; pointer-events: auto;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12);
  color: #9aa093; font: 700 12px ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase;
}
.tree-pooltab.pool-hero.on { color: #ffce6b; border-color: #d98b3a; background: rgba(217,139,58,.16); }
.tree-pooltab.pool-kingdom.on { color: #bfe0ff; border-color: #5f9fd4; background: rgba(95,159,212,.16); }

.tree-tabs { display: flex; gap: 6px; padding: 0 14px 12px; background: #141d10; flex: 0 0 auto; }
.tree-tab {
  flex: 1; padding: 9px 6px; border-radius: 10px 10px 0 0; pointer-events: auto;
  background: rgba(0,0,0,.22); border: 0; border-bottom: 2px solid transparent;
  color: #8a8f85; font: 700 13px Georgia, serif;
}
.tree-tab.on { background: #1b2416; color: #f5ead0; border-bottom-color: #f6c945; }

/* The board scrolls; the canvas is a positioned coordinate space. */
.tree-board { flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; }
.tree-canvas { position: relative; width: 100%; padding-bottom: 120px; }
.tree-wires { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.tree-wire {
  fill: none; stroke: rgba(255,255,255,.14); stroke-width: 3;
  vector-effect: non-scaling-stroke; stroke-linejoin: round;
}
.tree-wire.live { stroke: #7fd4a8; }

/* A tile: hex glyph, cost badge, name. Positioned by percentage so the board
   reflows with the viewport instead of needing a fixed canvas width. */
.tree-cell {
  position: absolute; transform: translate(-50%, -50%); pointer-events: auto;
  width: 84px; padding: 0; background: none; border: 0;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.tree-hex {
  width: 60px; height: 60px; display: grid; place-items: center; font-size: 27px; line-height: 1;
  background: #2b3a23; border: 2px solid rgba(255,255,255,.18);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  filter: grayscale(1) opacity(.45);
}
.tree-badge {
  margin-top: -11px; padding: 1px 8px; border-radius: 999px; font: 700 10px ui-monospace, monospace;
  background: #141d10; border: 1px solid rgba(255,255,255,.2); color: #cdc6b4;
}
.tree-cell-name { font: 600 10px/1.15 Georgia, serif; color: #8a8f85; text-align: center; max-width: 84px; }

.tree-cell.is-open .tree-hex { filter: none; border-color: #f6c945; box-shadow: 0 0 0 4px rgba(246,201,69,.14); }
.tree-cell.is-open .tree-badge { color: #f6c945; border-color: #f6c945; }
.tree-cell.is-open .tree-cell-name { color: #f5ead0; }
.tree-cell.is-taken .tree-hex { filter: none; background: #3c5a2c; border-color: #7fd4a8; }
.tree-cell.is-taken .tree-badge { color: #7fd4a8; border-color: #7fd4a8; }
.tree-cell.is-taken .tree-cell-name { color: #dff0d8; }
.tree-cell.is-forgone .tree-hex { filter: grayscale(1) opacity(.25); border-style: dashed; }
.tree-cell.sel .tree-hex { box-shadow: 0 0 0 4px rgba(255,255,255,.35); }

/* Keystones are the end of a path and look like it. */
.tree-cell.kind-keystone .tree-hex { width: 74px; height: 74px; font-size: 33px; border-width: 3px; }
.tree-cell.kind-keystone.is-open .tree-hex { border-color: #ff9d3c; box-shadow: 0 0 0 5px rgba(255,157,60,.18); }
.tree-cell.kind-ability .tree-hex { border-style: dashed; }

/* Detail sheet — descriptions live here so the board stays a board. */
.tree-sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 5; pointer-events: auto;
  background: #24311c; border-top: 2px solid #f6c945;
  padding: 14px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: 9px;
  box-shadow: 0 -12px 28px rgba(0,0,0,.45);
}
.tree-sheet.kind-keystone { border-top-color: #ff9d3c; }
.tree-sheet-head { display: flex; align-items: center; gap: 12px; }
.tree-sheet-icon {
  width: 44px; height: 44px; flex: 0 0 auto; display: grid; place-items: center; font-size: 22px;
  background: #2b3a23; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.tree-sheet-name { font: 700 19px Georgia, serif; color: #f6c945; }
.tree-sheet-kind {
  font: 700 10px ui-monospace, monospace; color: #9aa093;
  letter-spacing: .07em; text-transform: uppercase;
}
.tree-sheet-desc { font: 400 14px/1.45 sans-serif; color: #f5ead0; }
.tree-sheet-act {
  padding: 13px; border-radius: 12px; border: 0; pointer-events: auto;
  background: #f6c945; color: #22300f; font: 700 15px ui-monospace, monospace;
}
.tree-sheet-act.ghost { background: transparent; border: 1px solid rgba(255,255,255,.28); color: #f5ead0; }
.tree-sheet-act[disabled] { background: rgba(255,255,255,.08); color: #8a8f85; }
`;
}
