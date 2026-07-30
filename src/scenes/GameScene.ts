import Phaser from 'phaser';
import type { GameData } from '../data/loader';
import { Simulation } from '../engine/simulation';
import type { EnemyInstance } from '../engine/enemySystem';

const PAL = {
  grassA: 0x4a7c3a,
  grassB: 0x548a41,
  path: 0xc9a86a,
  pathEdge: 0xa5814a,
  stone: 0x8f8f96,
  stoneDark: 0x6a6a72,
  forge: 0x44464e,
  gold: '#f6c945',
  text: '#f5ead0',
  btn: 0x3f7d2f,
  btnHi: 0x59a844,
};

/** Placeholder tints keyed by spriteRef until the art pass; unknown refs render gray. */
const ENEMY_TINTS: Record<string, number> = {
  'enemy-grunt': 0x7a9e3b,
  'enemy-runner': 0xc46a2d,
  'enemy-brute': 0x8d4fa8,
};
const DEFAULT_TINT = 0x999999;

/**
 * Pure renderer over the Simulation: creates/destroys enemy circles on sim
 * events, copies positions every frame. All game logic lives in /engine.
 */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private data_!: GameData;
  private enemyViews = new Map<number, Phaser.GameObjects.Arc>();
  private waveLabel!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Container;

  constructor() {
    super('Game');
  }

  init(args: { gameData: GameData }): void {
    this.data_ = args.gameData;
  }

  create(): void {
    const map = this.data_.maps['meadow-road'];
    if (!map) throw new Error('GameScene: seed map "meadow-road" missing');
    const waveSet = this.data_.waveSets[map.id];
    if (!waveSet) throw new Error(`GameScene: no wave set for map "${map.id}"`);

    this.sim = new Simulation({ enemies: this.data_.enemies, map, waveSet });
    this.sim.enemySystem.onSpawn = (e) => this.addEnemyView(e);
    this.sim.enemySystem.onDeath = (e) => this.removeEnemyView(e.id);

    this.drawMap(map);
    this.buildHud();
  }

  override update(_time: number, deltaMs: number): void {
    this.sim.advance(deltaMs / 1000);

    for (const e of this.sim.enemySystem.enemies) {
      const view = this.enemyViews.get(e.id);
      if (view) view.setPosition(e.x, e.y);
    }

    const { phase, waveRunner } = this.sim;
    this.startButton.setVisible(phase === 'build');
    if (phase === 'build') {
      this.waveLabel.setText(
        waveRunner.waveNumber === 0 ? 'Get ready' : `Wave ${waveRunner.waveNumber} clear`,
      );
    } else if (phase === 'wave') {
      this.waveLabel.setText(`Wave ${waveRunner.waveNumber} / ${waveRunner.totalWaves}`);
    } else {
      this.waveLabel.setText('All waves cleared');
    }
  }

  private addEnemyView(e: EnemyInstance): void {
    const tint = ENEMY_TINTS[e.config.spriteRef] ?? DEFAULT_TINT;
    const view = this.add.circle(e.x, e.y, e.config.radius, tint).setDepth(10);
    view.setStrokeStyle(2, 0x1c1c1c, 0.6);
    this.enemyViews.set(e.id, view);
  }

  private removeEnemyView(id: number): void {
    this.enemyViews.get(id)?.destroy();
    this.enemyViews.delete(id);
  }

  private drawMap(map: NonNullable<GameData['maps'][string]>): void {
    const g = this.add.graphics();
    g.fillStyle(PAL.grassA);
    g.fillRect(0, 0, map.world.width, map.world.height);
    g.fillStyle(PAL.grassB);
    for (let y = 0; y < map.world.height; y += 60) {
      for (let x = 0; x < map.world.width; x += 60) {
        if (((x + y) / 60) % 2 === 0) g.fillRect(x, y, 60, 60);
      }
    }

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

    for (const plot of map.plots) {
      g.lineStyle(3, 0xffffff, 0.55);
      g.strokeCircle(plot.position.x, plot.position.y, 20);
    }

    // Gate
    const gate = map.gate.position;
    g.fillStyle(PAL.stone);
    g.fillRect(gate.x - 36, gate.y - 26, 72, 48);
    g.fillStyle(PAL.stoneDark);
    g.fillRect(gate.x - 36, gate.y - 26, 72, 10);

    // Forge
    const forge = map.forge.position;
    g.fillStyle(PAL.forge);
    g.fillRect(forge.x - 16, forge.y - 12, 32, 24);
  }

  private buildHud(): void {
    this.waveLabel = this.add
      .text(210, 34, 'Get ready', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: PAL.text,
      })
      .setOrigin(0.5)
      .setDepth(20);

    const w = 190;
    const h = 54;
    const bg = this.add.rectangle(0, 0, w, h, PAL.btn).setStrokeStyle(3, PAL.btnHi);
    const label = this.add
      .text(0, 0, 'Start wave', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: PAL.text,
      })
      .setOrigin(0.5);
    this.startButton = this.add.container(210, 715, [bg, label]).setDepth(20); // prototype: top edge at H-92
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.sim.startNextWave();
    });
  }
}
