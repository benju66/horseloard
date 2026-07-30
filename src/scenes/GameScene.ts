import Phaser from 'phaser';
import type { GameData } from '../data/loader';
import { Simulation } from '../engine/simulation';
import type { EnemyInstance } from '../engine/enemySystem';
import { VirtualJoystick } from '../ui/joystick';
import { WorldBubble } from '../ui/bubble';

const PAL = {
  grassA: 0x4a7c3a,
  grassB: 0x548a41,
  path: 0xc9a86a,
  pathEdge: 0xa5814a,
  stone: 0x8f8f96,
  stoneDark: 0x6a6a72,
  forge: 0x44464e,
  gold: 0xf6c945,
  goldText: '#f6c945',
  text: '#f5ead0',
  btn: 0x3f7d2f,
  btnHi: 0x59a844,
  hero: 0x3b5dc9,
  heroHelm: 0x2b3f8f,
  horse: 0x7a5230,
  horseDark: 0x5c3d22,
  mane: 0x3c2814,
  skin: 0xe8b88a,
  arrow: 0xe8dcc0,
  hp: 0xe5484d,
  hpBg: 0x3a1518,
};

/** Placeholder tints keyed by spriteRef until the art pass; unknown refs render gray. */
const ENEMY_TINTS: Record<string, number> = {
  'enemy-grunt': 0x7a9e3b,
  'enemy-runner': 0xc46a2d,
  'enemy-brute': 0x8d4fa8,
};
const DEFAULT_TINT = 0x999999;
const FLASH_MS = 90;
const FORGE_REACH = 55;

/**
 * Pure renderer over the Simulation: creates/destroys enemy circles on sim
 * events, copies positions every frame. All game logic lives in /engine.
 */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private data_!: GameData;
  private enemyViews = new Map<number, Phaser.GameObjects.Arc>();
  private enemyTints = new Map<number, number>();
  private flashUntil = new Map<number, number>();
  private waveLabel!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Container;
  private joystick!: VirtualJoystick;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private forgeBubble!: WorldBubble;
  private heroG!: Phaser.GameObjects.Graphics;
  private arrowG!: Phaser.GameObjects.Graphics;
  private hpG!: Phaser.GameObjects.Graphics;
  private bob = 0;

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

    this.sim = new Simulation({
      enemies: this.data_.enemies,
      map,
      waveSet,
      hero: this.data_.hero,
      economy: this.data_.economy,
    });
    this.sim.enemySystem.onSpawn.push((e) => this.addEnemyView(e));
    this.sim.enemySystem.onDeath.push((e) => this.removeEnemyView(e.id));
    this.sim.enemySystem.onDamaged.push((e) => {
      this.flashUntil.set(e.id, this.time.now + FLASH_MS);
    });
    this.sim.hero.onStagger.push(() => {
      this.cameras.main.shake(120, 0.006);
    });

    this.drawMap(map);
    this.hpG = this.add.graphics().setDepth(11);
    this.arrowG = this.add.graphics().setDepth(14);
    this.heroG = this.add.graphics().setDepth(15);
    this.buildHud();

    this.input.addPointer(2); // thumb + future ability taps
    this.joystick = new VirtualJoystick(this);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as GameScene['keys'];

    this.forgeBubble = new WorldBubble(this);
    this.forgeBubble.onTap = () => {
      this.sim.buyBowUpgrade();
    };
  }

  override update(_time: number, deltaMs: number): void {
    this.readInput();
    this.sim.advance(deltaMs / 1000);
    this.syncEnemies();
    this.drawHero(deltaMs / 1000);
    this.drawArrows();
    this.updateHud();
  }

  private readInput(): void {
    let x = this.joystick.value.x;
    let y = this.joystick.value.y;
    if (this.keys.W.isDown) y -= 1;
    if (this.keys.S.isDown) y += 1;
    if (this.keys.A.isDown) x -= 1;
    if (this.keys.D.isDown) x += 1;
    this.sim.hero.input.x = x;
    this.sim.hero.input.y = y;
  }

  private syncEnemies(): void {
    const now = this.time.now;
    this.hpG.clear();
    for (const e of this.sim.enemySystem.enemies) {
      const view = this.enemyViews.get(e.id);
      if (!view) continue;
      view.setPosition(e.x, e.y);
      const flashing = (this.flashUntil.get(e.id) ?? 0) > now;
      view.fillColor = flashing ? 0xffffff : (this.enemyTints.get(e.id) ?? DEFAULT_TINT);
      if (e.hp < e.maxHp) {
        const w = e.config.radius * 2;
        const x = e.x - w / 2;
        const y = e.y - e.config.radius - 12;
        this.hpG.fillStyle(PAL.hpBg);
        this.hpG.fillRect(x, y, w, 4);
        this.hpG.fillStyle(PAL.hp);
        this.hpG.fillRect(x, y, (w * e.hp) / e.maxHp, 4);
      }
    }
  }

  private drawHero(dt: number): void {
    const hero = this.sim.hero;
    if (hero.moving) this.bob += dt * 12;
    const bob = Math.sin(this.bob) * 2;
    const lg = Math.sin(this.bob * 2) * 3;
    const g = this.heroG;

    g.clear();
    g.setPosition(hero.x, hero.y);
    g.setScale(hero.dir, 1);

    // shadow
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(0, 14, 52, 16);
    // horse body
    g.fillStyle(PAL.horse);
    g.fillRoundedRect(-20, -10 + bob * 0.4, 40, 20, 9);
    // legs
    g.fillStyle(PAL.horseDark);
    g.fillRect(-16, 8, 5, 10 + lg);
    g.fillRect(11, 8, 5, 10 - lg);
    // neck + head
    g.fillStyle(PAL.horse);
    g.fillRoundedRect(14, -22 + bob * 0.4, 10, 18, 4);
    g.fillRoundedRect(18, -26 + bob * 0.4, 14, 10, 5);
    // mane + tail
    g.fillStyle(PAL.mane);
    g.fillRect(13, -24 + bob * 0.4, 4, 14);
    g.fillTriangle(-20, -8, -28, 2, -19, 6);
    // rider
    g.fillStyle(PAL.hero);
    g.fillRoundedRect(-8, -26 + bob, 14, 18, 5);
    g.fillStyle(PAL.skin);
    g.fillCircle(-1, -32 + bob, 6);
    g.fillStyle(PAL.heroHelm);
    g.fillRoundedRect(-8, -38 + bob, 14, 7, 3);
    // bow
    g.lineStyle(2.5, PAL.arrow);
    g.beginPath();
    g.arc(10, -22 + bob, 9, -1.2, 1.2);
    g.strokePath();
  }

  private drawArrows(): void {
    const g = this.arrowG;
    g.clear();
    g.lineStyle(3, PAL.arrow);
    for (const p of this.sim.projectileSystem.projectiles) {
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - p.dirX * 10, p.y - p.dirY * 10);
      g.strokePath();
    }
  }

  private updateHud(): void {
    const { phase, waveRunner, gold, hero } = this.sim;
    this.goldText.setText(String(gold));
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

    // Forge bubble: ride close, bow not maxed
    const map = this.data_.maps['meadow-road']!;
    const forge = map.forge.position;
    const cost = hero.nextBowCost();
    const near = Math.hypot(hero.x - forge.x, hero.y - forge.y) < FORGE_REACH;
    if (near && cost !== null) {
      this.forgeBubble.show(
        forge.x + 20,
        forge.y - 100,
        `Bow Lv${hero.bowLevel + 1}`,
        `${cost} gold`,
        gold >= cost,
      );
    } else {
      this.forgeBubble.hide();
    }
  }

  private addEnemyView(e: EnemyInstance): void {
    const tint = ENEMY_TINTS[e.config.spriteRef] ?? DEFAULT_TINT;
    const view = this.add.circle(e.x, e.y, e.config.radius, tint).setDepth(10);
    view.setStrokeStyle(2, 0x1c1c1c, 0.6);
    this.enemyViews.set(e.id, view);
    this.enemyTints.set(e.id, tint);
  }

  private removeEnemyView(id: number): void {
    this.enemyViews.get(id)?.destroy();
    this.enemyViews.delete(id);
    this.enemyTints.delete(id);
    this.flashUntil.delete(id);
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

    // Forge (anvil)
    const forge = map.forge.position;
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(forge.x, forge.y + 12, 48, 16);
    g.fillStyle(0x4a3018);
    g.fillRoundedRect(forge.x - 16, forge.y - 2, 32, 14, 3);
    g.fillStyle(PAL.forge);
    g.fillRoundedRect(forge.x - 13, forge.y - 12, 26, 11, 4);
    g.fillStyle(0x5a5d66);
    g.fillRoundedRect(forge.x - 18, forge.y - 16, 36, 6, 3);
  }

  private buildHud(): void {
    const hudBg = this.add.graphics().setDepth(19);
    hudBg.fillStyle(0x1a140c, 0.82);
    hudBg.fillRoundedRect(8, 8, 404, 52, 12);

    this.add.circle(30, 34, 9, PAL.gold).setDepth(20);
    this.goldText = this.add
      .text(45, 34, '0', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: PAL.text,
      })
      .setOrigin(0, 0.5)
      .setDepth(20);

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
