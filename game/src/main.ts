import Phaser from 'phaser'
import { MainMenuScene } from './scenes/MainMenuScene'
import { SlotSelectScene } from './scenes/SlotSelectScene'
import { CharacterSelectScene } from './scenes/CharacterSelectScene'
import { WorldMapScene } from './scenes/WorldMapScene'
import { SkillTreeScene } from './scenes/SkillTreeScene'
import { BattleScene } from './scenes/BattleScene'

// Milestone 2 combat slice: ground physics, jump/double-jump, five-hit combo.
// All game rules live in Phaser-independent modules under src/systems/; this
// scene is the render/input shell. The `window.__scene` acceptance hook is set
// inside BattleScene.create().
//
// The shell (main menu -> slot select -> character select) boots first; it
// hands off to WorldMapScene (S1 hub) via scene.start('worldmap') and the game
// registry, which in turn hands off to BattleScene per node clicked.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 540,
  backgroundColor: '#0b0e1a',
  // Enables `scene.add.dom(...)` so the dialogue input can live inside the
  // canvas (kept aligned to game coords by Phaser across scaling/letterboxing).
  dom: { createContainer: true },
  scene: [MainMenuScene, SlotSelectScene, CharacterSelectScene, WorldMapScene, SkillTreeScene, BattleScene],
})
