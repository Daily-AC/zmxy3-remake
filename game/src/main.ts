import Phaser from 'phaser'

class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create() {
    this.add
      .text(480, 270, '造梦西游3 Remake\n素材管线接入中…', {
        fontSize: '28px',
        color: '#e8d9a0',
        align: 'center',
      })
      .setOrigin(0.5)
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 540,
  backgroundColor: '#0b0e1a',
  pixelArt: false,
  scene: [BootScene],
})
