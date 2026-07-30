import Phaser from 'phaser';

/** Placeholder boot scene — proves the Phaser + Vite + PWA shell renders. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add
      .text(210, 300, 'HORSE LORD', {
        fontFamily: 'Georgia, serif',
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#f6c945',
      })
      .setOrigin(0.5);
    this.add
      .text(210, 350, 'Ride. Shoot. Loot. Build.', {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        color: '#f5ead0',
      })
      .setOrigin(0.5);
  }
}
