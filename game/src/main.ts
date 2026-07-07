import Phaser from 'phaser'
import { BattleScene } from './scenes/BattleScene'

// Milestone 2 combat slice: ground physics, jump/double-jump, five-hit combo.
// All game rules live in Phaser-independent modules under src/systems/; this
// scene is the render/input shell. The `window.__scene` acceptance hook is set
// inside BattleScene.create().
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 540,
  backgroundColor: '#0b0e1a',
  scene: [BattleScene],
})
