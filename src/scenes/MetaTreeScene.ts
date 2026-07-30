import Phaser from 'phaser';
import type { GameData } from '../data/loader';
import type { SaveManager } from '../data/saveManager';
import { canBuyRank, spentTokens, type SaveData } from '../engine/progression';

const TEXT = '#f5ead0';
const GOLD = '#f6c945';
const DIM = '#8a8f85';
const BRANCH_NAMES: Record<string, string> = { hero: 'Hero', towers: 'Towers', kingdom: 'Kingdom' };

/** The meta tree: tokens in, permanent power out. Respec is always free. */
export class MetaTreeScene extends Phaser.Scene {
  constructor() {
    super('MetaTree');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#161d13');
    this.render();
  }

  private render(): void {
    this.children.removeAll();
    const data = this.registry.get('gameData') as GameData;
    const save = this.registry.get('save') as SaveData;
    const saveManager = this.registry.get('saveManager') as SaveManager;

    this.add
      .text(210, 44, 'META TREE', { fontFamily: 'Georgia, serif', fontSize: '28px', fontStyle: 'bold', color: GOLD })
      .setOrigin(0.5);
    this.add
      .text(120, 78, `⬢ ${save.tokens} tokens`, { fontFamily: 'sans-serif', fontSize: '14px', color: TEXT })
      .setOrigin(0.5);

    const spent = spentTokens(data.metaTree, save.meta.ranks);
    const respec = this.add
      .rectangle(300, 78, 130, 30, 0x54402a)
      .setStrokeStyle(2, 0x8f6f4a)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(300, 78, `Respec (+${spent})`, { fontFamily: 'sans-serif', fontSize: '12px', color: TEXT })
      .setOrigin(0.5);
    respec.on('pointerdown', () => {
      if (spent <= 0) return;
      save.tokens += spent;
      save.meta.ranks = {};
      void saveManager.save(save);
      this.render();
    });

    let y = 120;
    for (const branch of ['hero', 'towers', 'kingdom']) {
      const nodes = data.metaTree.filter((n) => n.branch === branch);
      if (nodes.length === 0) continue;
      this.add
        .text(24, y, BRANCH_NAMES[branch] ?? branch, {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color: GOLD,
        })
        .setOrigin(0, 0.5);
      y += 26;

      for (const node of nodes) {
        const rank = save.meta.ranks[node.id] ?? 0;
        const max = node.costPerRank.length;
        const check = canBuyRank(node, data.metaTree, save.meta.ranks, save.tokens);

        this.add.rectangle(210, y + 12, 380, 44, 0x212b1b).setStrokeStyle(1, 0x39462f);
        this.add
          .text(28, y + 4, `${node.name}  ${rank}/${max}`, {
            fontFamily: 'sans-serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: rank > 0 ? GOLD : TEXT,
          })
          .setOrigin(0, 0.5);
        this.add
          .text(28, y + 22, node.description, { fontFamily: 'sans-serif', fontSize: '10px', color: DIM })
          .setOrigin(0, 0.5);

        if (check.cost !== null) {
          const buyable = check.ok;
          const btn = this.add
            .rectangle(362, y + 12, 64, 34, buyable ? 0x3f7d2f : 0x2c332a)
            .setStrokeStyle(2, buyable ? 0x59a844 : 0x444d40);
          this.add
            .text(362, y + 12, `⬢${check.cost}`, {
              fontFamily: 'sans-serif',
              fontSize: '13px',
              color: buyable ? TEXT : DIM,
            })
            .setOrigin(0.5);
          if (buyable) {
            btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
              save.tokens -= check.cost!;
              save.meta.ranks[node.id] = rank + 1;
              void saveManager.save(save);
              this.render();
            });
          } else if (check.reason && check.reason !== 'tokens') {
            this.add
              .text(362, y + 32, check.reason, { fontFamily: 'sans-serif', fontSize: '8px', color: DIM })
              .setOrigin(0.5);
          }
        } else {
          this.add
            .text(362, y + 12, 'MAX', { fontFamily: 'sans-serif', fontSize: '13px', color: GOLD })
            .setOrigin(0.5);
        }
        y += 52;
      }
      y += 14;
    }

    const back = this.add
      .rectangle(210, 740, 180, 44, 0x3f7d2f)
      .setStrokeStyle(3, 0x59a844)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(210, 740, 'Back', { fontFamily: 'sans-serif', fontSize: '18px', fontStyle: 'bold', color: TEXT })
      .setOrigin(0.5);
    back.on('pointerdown', () => this.scene.start('MapSelect'));
  }
}
