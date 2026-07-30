import Phaser from 'phaser';
import { loadGameData, type GameData } from '../data/loader';

const PAL = {
  grassA: 0x4a7c3a,
  grassB: 0x548a41,
  path: 0xc9a86a,
  pathEdge: 0xa5814a,
  stone: 0x8f8f96,
  gold: 0xf6c945,
  text: '#f5ead0',
  error: '#ff6b6b',
};

/**
 * Boot: validates all game data (fails loud, with file + field path), then
 * renders the first map straight from the validated data as proof of life.
 * No engine code lives here — this is a render-only preview until M0.3.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    let data: GameData;
    try {
      data = loadGameData();
    } catch (err) {
      this.showDataError(err);
      throw err;
    }

    const map = data.maps['meadow-road'];
    if (!map) throw new Error('Boot: expected seed map "meadow-road" to exist');

    this.drawGrass();
    const g = this.add.graphics();

    // Lanes, from waypoint data
    for (const lane of map.lanes) {
      const first = lane.waypoints[0];
      if (!first) continue;
      for (const [width, color] of [
        [46, PAL.pathEdge],
        [38, PAL.path],
      ] as const) {
        g.lineStyle(width, color);
        g.beginPath();
        g.moveTo(first.x, first.y);
        for (const p of lane.waypoints) g.lineTo(p.x, p.y);
        g.strokePath();
      }
    }

    // Tower plots
    for (const plot of map.plots) {
      g.lineStyle(3, 0xffffff, 0.55);
      g.strokeCircle(plot.position.x, plot.position.y, 20);
    }

    // Gate + forge markers
    g.fillStyle(PAL.stone);
    g.fillRect(map.gate.position.x - 36, map.gate.position.y - 26, 72, 48);
    g.fillStyle(0x44464e);
    g.fillRect(map.forge.position.x - 16, map.forge.position.y - 12, 32, 24);

    this.add
      .text(210, 240, 'HORSE LORD', {
        fontFamily: 'Georgia, serif',
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#f6c945',
      })
      .setOrigin(0.5);

    const waveCount = Object.values(data.waveSets).reduce(
      (n, ws) => n + ws.waves.length,
      0,
    );
    const summary = [
      'data validated ✓',
      `${data.towers.towers.length} tower · ${data.enemies.enemies.length} enemies · ${data.abilities.length} abilities`,
      `${Object.keys(data.maps).length} map · ${waveCount} waves · ${data.metaTree.length} meta nodes`,
    ].join('\n');
    this.add
      .text(210, 300, summary, {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: PAL.text,
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5);
  }

  private drawGrass(): void {
    const g = this.add.graphics();
    g.fillStyle(PAL.grassA);
    g.fillRect(0, 0, 420, 780);
    g.fillStyle(PAL.grassB);
    for (let y = 0; y < 780; y += 60) {
      for (let x = 0; x < 420; x += 60) {
        if (((x + y) / 60) % 2 === 0) g.fillRect(x, y, 60, 60);
      }
    }
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
