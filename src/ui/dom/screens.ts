import type { GameData } from '../../data/loader';
import { canBuyRank, spentTokens, unlockedMapIds, type SaveData } from '../../engine/progression';

/**
 * Map select and meta tree, DOM overlay edition (MG.5).
 *
 * Both screens are pure presentation over `progression.ts` — unlock rules,
 * token costs, prerequisites and refunds all live in the engine and are already
 * tested there. Nothing here decides anything; it renders decisions and reports
 * taps back to the host.
 */

export interface ScreenHost {
  data: GameData;
  save: SaveData;
  onPlay(mapId: string): void;
  onSaveChanged(save: SaveData): void;
}

export class MapSelectScreen {
  private readonly root: HTMLDivElement;
  private readonly host: ScreenHost;

  constructor(layer: HTMLElement, host: ScreenHost, openMetaTree: () => void) {
    this.host = host;
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.style.display = 'none';
    layer.append(this.root);
    this.openMetaTree = openMetaTree;
  }

  private readonly openMetaTree: () => void;

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
    const tokens = document.createElement('div');
    tokens.className = 'screen-sub';
    tokens.textContent = `⬢ ${save.tokens} tokens`;
    this.root.append(title, tokens);

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
      if (open) row.addEventListener('click', () => this.host.onPlay(map.id));
      list.append(row);
    }
    this.root.append(list);

    const meta = document.createElement('button');
    meta.className = 'screen-action';
    meta.setAttribute('data-ui', '');
    meta.textContent = 'Meta tree';
    meta.addEventListener('click', () => this.openMetaTree());
    this.root.append(meta);
  }
}

export class MetaTreeScreen {
  private readonly root: HTMLDivElement;
  private readonly host: ScreenHost;
  private readonly onBack: () => void;

  constructor(layer: HTMLElement, host: ScreenHost, onBack: () => void) {
    this.host = host;
    this.onBack = onBack;
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

  private render(): void {
    const { data, save } = this.host;
    this.root.replaceChildren();

    const title = document.createElement('h1');
    title.className = 'screen-title';
    title.textContent = 'Meta tree';
    const sub = document.createElement('div');
    sub.className = 'screen-sub';
    sub.textContent = `⬢ ${save.tokens} tokens · ${spentTokens(data.metaTree, save.meta.ranks)} spent`;
    this.root.append(title, sub);

    const list = document.createElement('div');
    list.className = 'node-list';
    for (const node of data.metaTree) {
      const rank = save.meta.ranks[node.id] ?? 0;
      const max = node.costPerRank.length;
      const check = canBuyRank(node, data.metaTree, save.meta.ranks, save.tokens);

      const row = document.createElement('button');
      row.className = 'node-row';
      row.setAttribute('data-ui', '');
      row.disabled = !check.ok;

      const name = document.createElement('div');
      name.className = 'node-name';
      name.textContent = `${node.name}  ${rank}/${max}`;
      const desc = document.createElement('div');
      desc.className = 'node-desc';
      desc.textContent = node.description;
      const cost = document.createElement('div');
      cost.className = 'node-cost';
      cost.textContent =
        check.cost === null ? 'maxed' : check.ok ? `⬢ ${check.cost}` : `⬢ ${check.cost} · ${check.reason}`;

      row.append(name, desc, cost);
      row.addEventListener('click', () => {
        const fresh = canBuyRank(node, data.metaTree, this.host.save.meta.ranks, this.host.save.tokens);
        if (!fresh.ok || fresh.cost === null) return;
        const next: SaveData = structuredClone(this.host.save);
        next.tokens -= fresh.cost;
        next.meta.ranks[node.id] = (next.meta.ranks[node.id] ?? 0) + 1;
        this.host.onSaveChanged(next);
        this.render();
      });
      list.append(row);
    }
    this.root.append(list);

    // Free respec (DESIGN §7) — refunds every token so experimenting is safe.
    const respec = document.createElement('button');
    respec.className = 'screen-action ghost';
    respec.setAttribute('data-ui', '');
    respec.textContent = 'Respec (free)';
    respec.addEventListener('click', () => {
      const next: SaveData = structuredClone(this.host.save);
      next.tokens += spentTokens(data.metaTree, next.meta.ranks);
      next.meta.ranks = {};
      this.host.onSaveChanged(next);
      this.render();
    });

    const back = document.createElement('button');
    back.className = 'screen-action';
    back.setAttribute('data-ui', '');
    back.textContent = 'Back';
    back.addEventListener('click', () => this.onBack());
    this.root.append(respec, back);
  }
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
.screen-action.ghost { background: transparent; border: 1px solid rgba(255,255,255,.25); }`;
}
