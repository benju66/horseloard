import Phaser from 'phaser';
import type { GameData } from '../data/loader';
import type { SaveManager } from '../data/saveManager';
import { unlockedMapIds, type SaveData } from '../engine/progression';

const TEXT = '#f5ead0';
const GOLD = '#f6c945';
const DIM = '#8a8f85';

/** Campaign screen: linear unlocks, stars, endless per cleared map, meta tree. */
export class MapSelectScene extends Phaser.Scene {
  constructor() {
    super('MapSelect');
  }

  create(): void {
    const data = this.registry.get('gameData') as GameData;
    const save = this.registry.get('save') as SaveData;
    this.cameras.main.setBackgroundColor('#1a2618');

    this.add
      .text(210, 70, 'HORSE LORD', { fontFamily: 'Georgia, serif', fontSize: '36px', fontStyle: 'bold', color: GOLD })
      .setOrigin(0.5);
    this.add
      .text(210, 108, `⬢ ${save.tokens} tokens`, { fontFamily: 'sans-serif', fontSize: '15px', color: TEXT })
      .setOrigin(0.5);

    const maps = Object.values(data.maps).sort((a, b) => a.order - b.order);
    const unlocked = unlockedMapIds(save, maps);

    maps.forEach((map, i) => {
      const y = 190 + i * 96;
      const open = unlocked.has(map.id);
      const entry = save.campaign[map.id];
      const stars = entry?.stars ?? 0;

      const row = this.add
        .rectangle(210, y, 372, 82, open ? 0x24361f : 0x1c2419)
        .setStrokeStyle(2, open ? 0x59a844 : 0x333d30);
      this.add
        .text(38, y - 24, `${map.order}. ${map.name}`, {
          fontFamily: 'sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: open ? TEXT : DIM,
        })
        .setOrigin(0, 0.5);
      this.add
        .text(38, y + 2, open ? map.description : 'Complete the previous map to unlock', {
          fontFamily: 'sans-serif',
          fontSize: '11px',
          color: DIM,
          wordWrap: { width: 260 },
        })
        .setOrigin(0, 0.5);
      this.add
        .text(38, y + 26, '★'.repeat(stars) + '☆'.repeat(3 - stars), {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: open ? GOLD : DIM,
        })
        .setOrigin(0, 0.5);

      if (open) {
        row.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.scene.start('Game', { gameData: data, mapId: map.id });
        });
        if (entry?.completed) {
          const best = save.endlessBest[map.id];
          const endlessBtn = this.add
            .rectangle(352, y, 58, 58, 0x2c4a63)
            .setStrokeStyle(2, 0x5f9fd4)
            .setInteractive({ useHandCursor: true });
          this.add
            .text(352, y - 8, '∞', { fontFamily: 'serif', fontSize: '26px', color: '#bfe0ff' })
            .setOrigin(0.5);
          this.add
            .text(352, y + 16, best ? `best ${best}` : 'endless', {
              fontFamily: 'sans-serif',
              fontSize: '9px',
              color: '#bfe0ff',
            })
            .setOrigin(0.5);
          endlessBtn.on('pointerdown', () => {
            this.scene.start('Game', { gameData: data, mapId: map.id, endless: true });
          });
        }
      } else {
        this.add.text(352, y, '🔒', { fontSize: '24px' }).setOrigin(0.5);
      }
    });

    const metaBtn = this.add
      .rectangle(210, 660, 220, 54, 0x3f7d2f)
      .setStrokeStyle(3, 0x59a844)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(210, 660, 'Meta Tree', { fontFamily: 'sans-serif', fontSize: '20px', fontStyle: 'bold', color: TEXT })
      .setOrigin(0.5);
    metaBtn.on('pointerdown', () => this.scene.start('MetaTree'));
  }
}

export type { SaveManager };
