import Phaser from 'phaser';
import { loadGameData, type GameData } from '../data/loader';

const PAL = {
  text: '#f5ead0',
  gold: '#f6c945',
  dim: 'rgba(245, 234, 208, 0.85)',
  error: '#ff6b6b',
};

/**
 * Boot: validates all game data (fails loud, with file + field path), shows
 * the title, and hands the validated data to the Game scene on tap.
 */
/** Shipped sprite files (public/assets/sprites). Keys match data spriteRefs; missing refs fall back to shapes. */
const SPRITE_KEYS = [
  'enemy-grunt',
  'enemy-runner',
  'enemy-brute',
  'enemy-shieldbearer',
  'enemy-swarm',
  'tower-archer',
  'tower-bombard',
  'tower-frost',
  'tower-mill',
  'mill-blades',
  'gate',
  'forge',
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const key of SPRITE_KEYS) this.load.image(key, `assets/sprites/${key}.png`);
  }

  create(): void {
    let data: GameData;
    try {
      data = loadGameData();
    } catch (err) {
      this.showDataError(err);
      throw err;
    }

    this.cameras.main.setBackgroundColor('#1a2618');
    this.add
      .text(210, 260, 'HORSE LORD', {
        fontFamily: 'Georgia, serif',
        fontSize: '44px',
        fontStyle: 'bold',
        color: PAL.gold,
      })
      .setOrigin(0.5);
    this.add
      .text(210, 300, 'Ride. Shoot. Loot. Build.', {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        color: PAL.text,
      })
      .setOrigin(0.5);

    const waveCount = Object.values(data.waveSets).reduce((n, ws) => n + ws.waves.length, 0);
    this.add
      .text(
        210,
        370,
        [
          'data validated ✓',
          `${data.towers.towers.length} towers · ${data.enemies.enemies.length} enemies · ${data.abilities.length} abilities`,
          `${Object.keys(data.maps).length} maps · ${waveCount} waves · ${data.metaTree.length} meta nodes`,
        ].join('\n'),
        {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: PAL.dim,
          align: 'center',
          lineSpacing: 6,
        },
      )
      .setOrigin(0.5);

    const prompt = this.add
      .text(210, 520, 'Tap to ride', {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        fontStyle: 'bold',
        color: PAL.gold,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: prompt,
      y: 524,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.input.once('pointerdown', () => {
      const requested = new URLSearchParams(window.location.search).get('map');
      const mapId = requested && data.maps[requested] ? requested : 'the-ford';
      this.scene.start('Game', { gameData: data, mapId });
    });
  }

  private showDataError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.cameras.main.setBackgroundColor('#2a0f12');
    this.add
      .text(210, 100, 'DATA VALIDATION FAILED', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: PAL.error,
      })
      .setOrigin(0.5, 0);
    this.add
      .text(210, 150, message, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: PAL.text,
        wordWrap: { width: 380 },
      })
      .setOrigin(0.5, 0);
  }
}
