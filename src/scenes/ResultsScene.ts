import Phaser from 'phaser';
import type { GameData } from '../data/loader';

export interface ResultsData {
  victory: boolean;
  wavesCleared: number;
  totalWaves: number;
  kills: number;
  damageTaken: number;
  stars: 1 | 2 | 3;
  mapId: string;
  endless: boolean;
  tokensEarned: number;
  gameData: GameData;
}

/** End-of-run summary. Stars land with persistence (M2) — damage taken is already the metric. */
export class ResultsScene extends Phaser.Scene {
  private results!: ResultsData;

  constructor() {
    super('Results');
  }

  init(data: ResultsData): void {
    this.results = data;
  }

  create(): void {
    const r = this.results;
    this.cameras.main.setBackgroundColor(r.victory ? '#16240f' : '#1f0d0d');

    this.add
      .text(210, 250, r.victory ? 'The road holds' : 'The keep has fallen', {
        fontFamily: 'Georgia, serif',
        fontSize: '38px',
        fontStyle: 'bold',
        color: r.victory ? '#f6c945' : '#e5484d',
        align: 'center',
        wordWrap: { width: 380 },
      })
      .setOrigin(0.5);

    if (r.victory) {
      this.add
        .text(210, 300, '\u2605'.repeat(r.stars) + '\u2606'.repeat(3 - r.stars), {
          fontFamily: 'sans-serif',
          fontSize: '34px',
          color: '#f6c945',
        })
        .setOrigin(0.5);
    }

    const lines = [
      r.endless ? `Waves survived  ${r.wavesCleared}` : `Waves cleared  ${r.wavesCleared} / ${r.totalWaves}`,
      `Kills  ${r.kills}`,
      `Gate damage taken  ${Math.ceil(r.damageTaken)}`,
    ];
    if (r.tokensEarned > 0) lines.push(`Tokens earned  +${r.tokensEarned}`);
    this.add
      .text(210, 356, lines.join('\n'), {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#f5ead0',
        align: 'center',
        lineSpacing: 10,
      })
      .setOrigin(0.5, 0);

    const bg = this.add.rectangle(0, 0, 180, 54, 0x3f7d2f).setStrokeStyle(3, 0x59a844);
    const label = this.add
      .text(0, 0, 'Ride again', {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        fontStyle: 'bold',
        color: '#f5ead0',
      })
      .setOrigin(0.5);
    this.add.container(120, 540, [bg, label]);
    bg.setInteractive({ useHandCursor: true }).once('pointerdown', () => {
      this.scene.start('Game', { gameData: r.gameData, mapId: r.mapId, endless: r.endless });
    });

    const bg2 = this.add.rectangle(0, 0, 180, 54, 0x2c4a63).setStrokeStyle(3, 0x5f9fd4);
    const label2 = this.add
      .text(0, 0, 'Map select', {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        fontStyle: 'bold',
        color: '#f5ead0',
      })
      .setOrigin(0.5);
    this.add.container(302, 540, [bg2, label2]);
    bg2.setInteractive({ useHandCursor: true }).once('pointerdown', () => {
      this.scene.start('MapSelect');
    });
  }
}
