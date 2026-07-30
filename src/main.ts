import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { ResultsScene } from './scenes/ResultsScene';
import { MapSelectScene } from './scenes/MapSelectScene';
import { MetaTreeScene } from './scenes/MetaTreeScene';

// Fixed logical world, letterboxed to the screen — same convention as the
// prototype. Portrait 420x780; the sim and all data coordinates use this space.
export const WORLD_WIDTH = 420;
export const WORLD_HEIGHT = 780;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  backgroundColor: '#131c11',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MapSelectScene, MetaTreeScene, GameScene, ResultsScene],
});
