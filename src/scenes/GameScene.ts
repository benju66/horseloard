import Phaser from 'phaser';
import type { GameData } from '../data/loader';
import type { MapDef } from '../data/schemas';
import { Simulation } from '../engine/simulation';
import type { EnemyInstance } from '../engine/enemySystem';
import type { PlotState } from '../engine/towerSystem';
import { VirtualJoystick } from '../ui/joystick';
import { WorldBubble } from '../ui/bubble';
import { AbilityBar } from '../ui/abilityBar';

const PAL = {
  grassA: 0x4a7c3a,
  grassB: 0x548a41,
  path: 0xc9a86a,
  pathEdge: 0xa5814a,
  stone: 0x8f8f96,
  stoneDark: 0x6a6a72,
  wood: 0x6b4a2b,
  woodDark: 0x4a3018,
  forge: 0x44464e,
  gold: 0xf6c945,
  goldDark: 0xc99a1e,
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
  'enemy-shieldbearer': 0x8fa3b8,
  'enemy-swarm': 0xd9c85a,
};
/** Placeholder cap tints so the four towers read apart before the art pass. */
const TOWER_TINTS: Record<string, number> = {
  'tower-archer': 0x3b5dc9,
  'tower-bombard': 0x44464e,
  'tower-frost': 0x7fd4e8,
  'tower-mill': 0xf6c945,
};
const ELITE_GLOW = 0xf6c945;
/** M1: abilities unlocked by flag until the meta tree lands (M3). */
const FLAG_UNLOCKED_ABILITIES = ['volley', 'rally-horn'];
const DEFAULT_TINT = 0x999999;
const FLASH_MS = 90;
const FORGE_REACH = 55;
const PLOT_REACH = 52;
const GATE_REACH = 64;
const MAX_BUBBLES = 4;

/**
 * Pure renderer over the Simulation: creates/destroys enemy circles on sim
 * events, copies positions every frame. All game logic lives in /engine.
 */
type EnemyView =
  | { kind: 'sprite'; obj: Phaser.GameObjects.Sprite }
  | { kind: 'circle'; obj: Phaser.GameObjects.Arc };

/** Kenney unit frames are 128px with ~55px of body — scale so body ≈ 2×radius. */
const ENEMY_SPRITE_SCALE = 4.7;

export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private data_!: GameData;
  private map_!: MapDef;
  private enemyViews!: Map<number, EnemyView>;
  private enemyTints!: Map<number, number>;
  private flashUntil!: Map<number, number>;
  private plotMarkers!: Map<string, Phaser.GameObjects.Container>;
  private waveLabel!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private gateText!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Container;
  private joystick!: VirtualJoystick;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private bubbles!: WorldBubble[];
  private bubblesUsed = 0;
  private heroG!: Phaser.GameObjects.Graphics;
  private arrowG!: Phaser.GameObjects.Graphics;
  private hpG!: Phaser.GameObjects.Graphics;
  private towerG!: Phaser.GameObjects.Graphics;
  private coinG!: Phaser.GameObjects.Graphics;
  private ringG!: Phaser.GameObjects.Graphics;
  private towerSprites!: Map<string, Phaser.GameObjects.Sprite>;
  private millBlades!: Map<string, Phaser.GameObjects.Sprite>;
  private heroSprite: Phaser.GameObjects.Sprite | null = null;
  private startLabel!: Phaser.GameObjects.Text;
  private fpsText: Phaser.GameObjects.Text | null = null;
  private abilityBar!: AbilityBar;
  private mapId = 'the-ford';
  private ending = false;
  private bob = 0;

  constructor() {
    super('Game');
  }

  init(args: { gameData: GameData; mapId?: string }): void {
    this.data_ = args.gameData;
    this.mapId = args.mapId && args.gameData.maps[args.mapId] ? args.mapId : 'the-ford';
  }

  create(): void {
    // Phaser scenes are reused across restarts — every collection resets here.
    this.enemyViews = new Map();
    this.enemyTints = new Map();
    this.flashUntil = new Map();
    this.plotMarkers = new Map();
    this.towerSprites = new Map();
    this.millBlades = new Map();
    this.heroSprite = null;
    this.bubbles = [];
    this.bob = 0;
    this.ending = false;
    this.fpsText = null;

    const map = this.data_.maps[this.mapId];
    if (!map) throw new Error(`GameScene: map "${this.mapId}" missing`);
    this.map_ = map;
    const waveSet = this.data_.waveSets[map.id];
    if (!waveSet) throw new Error(`GameScene: no wave set for map "${map.id}"`);

    this.sim = new Simulation({
      enemies: this.data_.enemies,
      map,
      waveSet,
      hero: this.data_.hero,
      economy: this.data_.economy,
      towers: this.data_.towers,
      abilities: this.data_.abilities,
      unlockedAbilityIds: FLAG_UNLOCKED_ABILITIES,
    });
    this.sim.enemySystem.onSpawn.push((e) => this.addEnemyView(e));
    this.sim.enemySystem.onDeath.push((e) => this.removeEnemyView(e.id));
    this.sim.enemySystem.onDamaged.push((e) => {
      this.flashUntil.set(e.id, this.time.now + FLASH_MS);
    });
    this.sim.hero.onStagger.push(() => {
      this.cameras.main.shake(200, 0.012);
    });

    this.drawMap(map);
    this.createPlotMarkers(map);
    this.towerG = this.add.graphics().setDepth(9);
    this.ringG = this.add.graphics().setDepth(8);
    this.coinG = this.add.graphics().setDepth(10);
    this.hpG = this.add.graphics().setDepth(11);
    this.arrowG = this.add.graphics().setDepth(14);
    this.heroG = this.add.graphics().setDepth(15);
    if (this.textures.exists('hero')) {
      if (!this.anims.exists('hero-gallop')) {
        this.anims.create({
          key: 'hero-gallop',
          frames: this.anims.generateFrameNumbers('hero', { start: 1, end: 3 }),
          frameRate: 11,
          repeat: -1,
        });
      }
      this.heroSprite = this.add
        .sprite(this.sim.hero.x, this.sim.hero.y, 'hero', 0)
        .setDisplaySize(76, 76)
        .setDepth(15);
    }
    this.buildHud();

    this.input.addPointer(2); // thumb + future ability taps
    this.joystick = new VirtualJoystick(this);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as GameScene['keys'];

    for (let i = 0; i < MAX_BUBBLES; i++) this.bubbles.push(new WorldBubble(this));

    this.abilityBar = new AbilityBar(this, this.sim.abilities.slots, (id) => {
      this.sim.castAbility(id);
    });

    // Blast feedback: a quick expanding ring wherever aoe lands.
    this.sim.projectileSystem.onExplosion.push((x, y, radius) => {
      this.blastRing(x, y, radius, 0xf0e0b0);
    });
    // Hero-cast feedback: Volley rains on the hero's position.
    this.sim.abilities.onCast.push((ability) => {
      if (ability.effect.type === 'aoe-damage') {
        this.blastRing(this.sim.hero.x, this.sim.hero.y, ability.effect.radius, 0x9db8ff);
      } else if (ability.effect.type === 'tower-rate-buff') {
        this.cameras.main.flash(180, 60, 120, 45);
      }
    });

    // FPS overlay: always in dev, ?fps in production — the M0 exit gate is 60fps on-device.
    if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('fps')) {
      this.fpsText = this.add
        .text(12, 66, '', { fontFamily: 'monospace', fontSize: '12px', color: '#9df29d' })
        .setDepth(50);
    }
  }

  override update(_time: number, deltaMs: number): void {
    this.readInput();
    this.sim.advance(deltaMs / 1000);
    this.syncEnemies();
    this.drawTowers(deltaMs);
    this.drawCoins();
    this.drawHero(deltaMs / 1000);
    this.drawArrows();
    this.updateHud();
    this.updateBubbles();
    this.abilityBar.update();
    this.fpsText?.setText(`${Math.round(this.game.loop.actualFps)} fps`);
    this.maybeEndRun();
  }

  private blastRing(x: number, y: number, radius: number, color: number): void {
    const ring = this.add.circle(x, y, 6).setStrokeStyle(4, color, 0.9).setDepth(13);
    this.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private maybeEndRun(): void {
    if (this.ending) return;
    const { phase } = this.sim;
    if (phase !== 'done' && phase !== 'defeat') return;
    this.ending = true;
    this.time.delayedCall(1400, () => {
      this.scene.start('Results', {
        victory: phase === 'done',
        wavesCleared: this.sim.waveRunner.waveNumber - (phase === 'defeat' ? 1 : 0),
        totalWaves: this.sim.waveRunner.totalWaves,
        kills: this.sim.kills,
        damageTaken: this.sim.gate.totalDamageTaken,
        stars: this.sim.stars(),
        mapId: this.mapId,
        gameData: this.data_,
      });
    });
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
      view.obj.setPosition(e.x, e.y);
      const flashing = (this.flashUntil.get(e.id) ?? 0) > now;
      if (view.kind === 'sprite') {
        if (flashing) view.obj.setTintFill(0xffffff);
        else view.obj.clearTint();
        view.obj.setFlipX(e.facingX < -0.1);
      } else {
        view.obj.fillColor = flashing ? 0xffffff : (this.enemyTints.get(e.id) ?? DEFAULT_TINT);
      }
      if (e.isElite) {
        this.hpG.lineStyle(3, ELITE_GLOW, 0.9);
        this.hpG.strokeCircle(e.x, e.y, e.config.radius + 6);
      }
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

  private drawTowers(deltaMs: number): void {
    const g = this.towerG;
    g.clear();
    for (const plot of this.sim.towerSystem.plots) {
      const marker = this.plotMarkers.get(plot.plotId);
      marker?.setVisible(plot.towerId === null);

      let sprite = this.towerSprites.get(plot.plotId);
      let blades = this.millBlades.get(plot.plotId);

      if (plot.towerId === null) {
        sprite?.setVisible(false);
        blades?.setVisible(false);
        continue;
      }

      const tower = this.sim.towerSystem.getTower(plot.towerId)!;
      const hasArt = this.textures.exists(tower.spriteRef);
      const size = 52 + plot.level * 6;

      g.fillStyle(0x000000, 0.22);
      g.fillEllipse(plot.x, plot.y + 16, 52, 18);

      if (hasArt) {
        if (!sprite) {
          sprite = this.add.sprite(plot.x, plot.y - 6, tower.spriteRef).setDepth(9);
          this.towerSprites.set(plot.plotId, sprite);
        }
        if (sprite.texture.key !== tower.spriteRef) sprite.setTexture(tower.spriteRef);
        sprite.setVisible(true).setPosition(plot.x, plot.y - 6).setDisplaySize(size, size);

        // Economy towers with art get spinning windmill blades if we ship them.
        const wantsBlades = this.sim.towerSystem.stats(plot)?.income !== undefined && this.textures.exists('mill-blades');
        if (wantsBlades) {
          if (!blades) {
            blades = this.add.sprite(plot.x, plot.y - 14, 'mill-blades').setDepth(10);
            this.millBlades.set(plot.plotId, blades);
          }
          blades.setVisible(true).setPosition(plot.x, plot.y - 14).setDisplaySize(size * 0.95, size * 0.95);
          blades.rotation += deltaMs * 0.0006;
        } else {
          blades?.setVisible(false);
        }
      } else {
        // No art for this tower (future content): the old vector tower keeps it playable.
        sprite?.setVisible(false);
        const h = 26 + plot.level * 7;
        g.fillStyle(PAL.wood);
        g.fillRoundedRect(plot.x - 15, plot.y - h + 14, 30, h, 4);
        g.fillStyle(PAL.stone);
        g.fillRoundedRect(plot.x - 19, plot.y - h + 2, 38, 14, 3);
        g.fillStyle(TOWER_TINTS[tower.spriteRef] ?? PAL.hero);
        g.fillCircle(plot.x, plot.y - h + 2, 5);
      }

      const def = this.sim.towerSystem.projectileDef(plot);
      if (def?.behavior === 'aura') {
        g.lineStyle(2, 0x7fd4e8, 0.22);
        g.strokeCircle(plot.x, plot.y, def.radius);
      }
      const aura = this.sim.towerSystem.stats(plot)?.towerAura;
      if (aura) {
        g.lineStyle(2, 0xf6c945, 0.2);
        g.strokeCircle(plot.x, plot.y, aura.radius);
      }
      g.fillStyle(PAL.gold);
      for (let i = 0; i < plot.level; i++) g.fillRect(plot.x - 14 + i * 8, plot.y + 26, 6, 4);
    }
  }

  private drawCoins(): void {
    const g = this.coinG;
    g.clear();
    const t = this.time.now / 1000;
    for (const c of this.sim.economy.coins) {
      const s = 1 + Math.sin(t * 6 + c.x) * 0.12;
      g.fillStyle(PAL.goldDark);
      g.fillCircle(c.x, c.y, 7 * s);
      g.fillStyle(PAL.gold);
      g.fillCircle(c.x, c.y - 1, 6 * s);
      g.fillStyle(0xffffff, 0.7);
      g.fillRect(c.x - 2, c.y - 4, 2, 2);
    }
  }

  private drawHero(dt: number): void {
    const hero = this.sim.hero;

    if (this.heroSprite) {
      // Sprite mode: shadow in graphics, body from the generated strip.
      const g = this.heroG;
      g.clear();
      g.setPosition(0, 0);
      g.setScale(1, 1);
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(hero.x, hero.y + 20, 54, 16);
      this.heroSprite.setPosition(hero.x, hero.y - 12);
      this.heroSprite.setFlipX(hero.dir < 0);
      if (hero.moving) {
        if (!this.heroSprite.anims.isPlaying) this.heroSprite.play('hero-gallop');
      } else if (this.heroSprite.anims.isPlaying) {
        this.heroSprite.stop();
        this.heroSprite.setFrame(0);
      }
      if (hero.staggered) {
        this.heroSprite.setTintFill(Math.floor(this.time.now / 60) % 2 === 0 ? 0xffffff : 0xe5484d);
      } else if (hero.charging) {
        this.heroSprite.setTint(0xaad4ff);
      } else {
        this.heroSprite.clearTint();
      }
      return;
    }

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
    // rider — flashes red/white while shoved so the stagger reads on the body, not just the camera
    const staggerFlash = hero.staggered
      ? Math.floor(this.time.now / 60) % 2 === 0
        ? 0xffffff
        : 0xe5484d
      : null;
    g.fillStyle(staggerFlash ?? PAL.hero);
    g.fillRoundedRect(-8, -26 + bob, 14, 18, 5);
    g.fillStyle(staggerFlash ?? PAL.skin);
    g.fillCircle(-1, -32 + bob, 6);
    g.fillStyle(staggerFlash ?? PAL.heroHelm);
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
    const { phase, waveRunner, gold, gate } = this.sim;
    this.goldText.setText(String(gold));
    this.gateText.setText(`♥ ${Math.ceil(gate.hp)}/${gate.maxHp}`);
    this.startButton.setVisible(phase === 'build');
    if (phase === 'build') {
      const bonus = this.sim.earlyStartBonus();
      this.startLabel.setText(bonus > 0 ? `Start wave  +${bonus}` : 'Start wave');
    }
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

  /** Contextual bubbles: nearest interactive thing (plot or forge) within reach. */
  private updateBubbles(): void {
    this.bubblesUsed = 0;
    this.ringG.clear();
    const hero = this.sim.hero;

    let nearestPlot: PlotState | null = null;
    let nearestPlotDist = PLOT_REACH;
    for (const plot of this.sim.towerSystem.plots) {
      const d = Math.hypot(hero.x - plot.x, hero.y - plot.y);
      if (d < nearestPlotDist) {
        nearestPlotDist = d;
        nearestPlot = plot;
      }
    }
    const forge = this.map_.forge.position;
    const forgeDist = Math.hypot(hero.x - forge.x, hero.y - forge.y);
    const gatePos = this.map_.gate.position;
    const gateDist = Math.hypot(hero.x - gatePos.x, hero.y - gatePos.y);

    if (nearestPlot && nearestPlotDist <= forgeDist && nearestPlotDist <= gateDist) {
      this.showPlotBubbles(nearestPlot);
    } else if (forgeDist < FORGE_REACH && forgeDist <= gateDist) {
      this.showForgeBubble();
    } else if (gateDist < GATE_REACH) {
      this.showGateBubble();
    }
    for (let i = this.bubblesUsed; i < this.bubbles.length; i++) this.bubbles[i]!.hide();
  }

  private showGateBubble(): void {
    if (this.sim.phase !== 'build') return;
    const quote = this.sim.repairQuote();
    if (!quote) return;
    const gatePos = this.map_.gate.position;
    const bubble = this.nextBubble();
    bubble.show(
      gatePos.x,
      gatePos.y - 110,
      `Repair +${quote.amount}`,
      `${quote.cost} gold`,
      this.sim.gold >= quote.cost,
    );
    bubble.onTap = () => {
      this.sim.repairGate();
    };
  }

  private nextBubble(): WorldBubble {
    return this.bubbles[this.bubblesUsed++]!;
  }

  private showPlotBubbles(plot: PlotState): void {
    const sys = this.sim.towerSystem;
    const gold = this.sim.gold;
    let y = plot.y + 26;
    const place = (title: string, sub: string, enabled: boolean, onTap: () => void) => {
      if (this.bubblesUsed >= this.bubbles.length) return;
      const bubble = this.nextBubble();
      bubble.show(plot.x, y, title, sub, enabled);
      bubble.onTap = onTap;
      y += 56;
    };

    if (plot.towerId === null) {
      for (const tower of sys.roster) {
        const cost = sys.buildCost(tower.id) ?? 0;
        place(`Build ${tower.name}`, `${cost} gold`, gold >= cost, () => {
          this.sim.buildTower(plot.plotId, tower.id);
        });
      }
      return;
    }

    // range ring for the built tower
    const stats = sys.stats(plot);
    if (stats) {
      this.ringG.lineStyle(2, 0xffffff, 0.18);
      this.ringG.strokeCircle(plot.x, plot.y, stats.range);
    }

    const upgradeCost = sys.upgradeCost(plot);
    if (upgradeCost !== null) {
      place(`Upgrade Lv${plot.level + 1}`, `${upgradeCost} gold`, gold >= upgradeCost, () => {
        this.sim.upgradeTower(plot.plotId);
      });
    }
    for (const branch of sys.branchOptions(plot)) {
      place(branch.name, `${branch.cost} gold`, gold >= branch.cost, () => {
        this.sim.branchTower(plot.plotId, branch.id);
      });
    }
    const refund = sys.sellRefund(plot, this.sim.economy.config.sellRefund);
    place('Sell', `+${refund} gold`, true, () => {
      this.sim.sellTower(plot.plotId);
    });
  }

  private showForgeBubble(): void {
    const forge = this.map_.forge.position;
    const cost = this.sim.hero.nextBowCost();
    if (cost === null) return;
    const bubble = this.nextBubble();
    bubble.show(
      forge.x + 20,
      forge.y - 100,
      `Bow Lv${this.sim.hero.bowLevel + 1}`,
      `${cost} gold`,
      this.sim.gold >= cost,
    );
    bubble.onTap = () => {
      this.sim.buyBowUpgrade();
    };
  }

  private addEnemyView(e: EnemyInstance): void {
    if (this.textures.exists(e.config.spriteRef)) {
      const size = e.config.radius * ENEMY_SPRITE_SCALE * (e.isElite ? 1.18 : 1);
      const obj = this.add.sprite(e.x, e.y, e.config.spriteRef).setDisplaySize(size, size).setDepth(10);
      this.enemyViews.set(e.id, { kind: 'sprite', obj });
    } else {
      // No art for this ref (future content): tinted circle keeps the game playable.
      const tint = ENEMY_TINTS[e.config.spriteRef] ?? DEFAULT_TINT;
      const obj = this.add.circle(e.x, e.y, e.config.radius, tint).setDepth(10);
      obj.setStrokeStyle(2, 0x1c1c1c, 0.6);
      this.enemyViews.set(e.id, { kind: 'circle', obj });
      this.enemyTints.set(e.id, tint);
    }
  }

  private removeEnemyView(id: number): void {
    this.enemyViews.get(id)?.obj.destroy();
    this.enemyViews.delete(id);
    this.enemyTints.delete(id);
    this.flashUntil.delete(id);
  }

  private createPlotMarkers(map: MapDef): void {
    for (const plot of map.plots) {
      const circle = this.add.circle(0, 0, 20).setStrokeStyle(3, 0xffffff, 0.55);
      const plus = this.add
        .text(0, 1, '+', {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color: 'rgba(255,255,255,0.55)',
        })
        .setOrigin(0.5);
      const marker = this.add
        .container(plot.position.x, plot.position.y, [circle, plus])
        .setDepth(9);
      this.plotMarkers.set(plot.id, marker);
    }
  }

  private drawMap(map: MapDef): void {
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

    // Gate + forge: shipped sprites, vector fallback for artless maps
    const gate = map.gate.position;
    if (this.textures.exists('gate')) {
      g.fillStyle(0x000000, 0.22);
      g.fillEllipse(gate.x, gate.y + 22, 96, 24);
      this.add.image(gate.x, gate.y, 'gate').setDisplaySize(104, 104);
    } else {
      g.fillStyle(PAL.stone);
      g.fillRect(gate.x - 36, gate.y - 26, 72, 48);
      g.fillStyle(PAL.stoneDark);
      g.fillRect(gate.x - 36, gate.y - 26, 72, 10);
    }

    const forge = map.forge.position;
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(forge.x, forge.y + 14, 52, 16);
    if (this.textures.exists('forge')) {
      this.add.image(forge.x, forge.y - 4, 'forge').setDisplaySize(60, 60);
    } else {
      g.fillStyle(PAL.woodDark);
      g.fillRoundedRect(forge.x - 16, forge.y - 2, 32, 14, 3);
      g.fillStyle(PAL.forge);
      g.fillRoundedRect(forge.x - 13, forge.y - 12, 26, 11, 4);
      g.fillStyle(0x5a5d66);
      g.fillRoundedRect(forge.x - 18, forge.y - 16, 36, 6, 3);
    }
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

    this.gateText = this.add
      .text(398, 34, '', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#e5484d',
      })
      .setOrigin(1, 0.5)
      .setDepth(20);

    const w = 190;
    const h = 54;
    const bg = this.add.rectangle(0, 0, w, h, PAL.btn).setStrokeStyle(3, PAL.btnHi);
    this.startLabel = this.add
      .text(0, 0, 'Start wave', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: PAL.text,
      })
      .setOrigin(0.5);
    this.startButton = this.add.container(210, 715, [bg, this.startLabel]).setDepth(20); // prototype: top edge at H-92
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (!this.sim.startNextWave()) return;
      const wave = this.sim.waveRunner.currentWaveData;
      if (wave?.archetypeId) {
        const archetype = this.data_.archetypes.find((a) => a.id === wave.archetypeId);
        if (archetype) this.showBanner(archetype.name, archetype.subtitle);
      }
    });
  }

  /** Special-wave warning banner: fades in, holds, fades (DESIGN §8). */
  private showBanner(name: string, subtitle: string): void {
    const bg = this.add.rectangle(210, 250, 420, 84, 0x1a0c0c, 0.85).setDepth(35);
    const title = this.add
      .text(210, 238, `⚠ ${name}`, {
        fontFamily: 'Georgia, serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#e5484d',
      })
      .setOrigin(0.5)
      .setDepth(36);
    const sub = this.add
      .text(210, 268, subtitle, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#f5ead0',
      })
      .setOrigin(0.5)
      .setDepth(36);
    const parts: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text> = [bg, title, sub];
    for (const part of parts) part.setAlpha(0);
    this.tweens.add({
      targets: parts,
      alpha: 1,
      duration: 250,
      yoyo: true,
      hold: 2100,
      onComplete: () => {
        for (const part of parts) part.destroy();
      },
    });
    this.cameras.main.shake(150, 0.004);
  }
}
