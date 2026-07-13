import Phaser from 'phaser'
import { MainMenuScene } from './scenes/MainMenuScene'
import { SlotSelectScene } from './scenes/SlotSelectScene'
import { CharacterSelectScene } from './scenes/CharacterSelectScene'
import { WorldMapScene } from './scenes/WorldMapScene'
import { SkillTreeScene } from './scenes/SkillTreeScene'
import { LoginScene } from './scenes/LoginScene'
import { LobbyScene } from './scenes/LobbyScene'
import { BattleLoadingScene } from './scenes/BattleLoadingScene'
import { BattleScene } from './scenes/BattleScene'
import { CombatCoreScene } from './scenes/CombatCoreScene'
import { ensureArtFontsLoaded } from './systems/artFont'
import { installOptimizedImageLoader } from './systems/optimizedAssets'
import { RENDER_METRICS, installHiDpiTextFactory } from './systems/renderScale'

// Milestone 2 combat slice: ground physics, jump/double-jump, five-hit combo.
// All game rules live in Phaser-independent modules under src/systems/; this
// scene is the render/input shell. The `window.__scene` acceptance hook is set
// inside BattleScene.create().
//
// The shell (main menu -> slot select -> character select) boots first; it
// hands off to WorldMapScene (S1 hub) via scene.start('worldmap') and the game
// registry, which in turn hands off to BattleScene per node clicked.
// Load the art-font candidates (systems/artFont.ts) before booting Phaser --
// local files, resolves fast, but text scenes must not draw on the first
// frame with the browser's fallback font and never refresh once the real
// face swaps in (Phaser Text doesn't watch document.fonts on its own).
installOptimizedImageLoader(Phaser.Loader.LoaderPlugin.prototype)
const searchParams = new URLSearchParams(window.location.search)
const combatCoreSlice = searchParams.get('combatCoreSlice') === '1'
const defaultScenes = [
  MainMenuScene,
  LoginScene,
  LobbyScene,
  SlotSelectScene,
  CharacterSelectScene,
  WorldMapScene,
  SkillTreeScene, BattleLoadingScene, BattleScene,
]
ensureArtFontsLoaded().finally(() => {
  installHiDpiTextFactory(Phaser.GameObjects.GameObjectFactory.prototype)
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: RENDER_METRICS.width,
    height: RENDER_METRICS.height,
    // 2026-07-09 用户点名"四周黑色背景没处理"：此前没配 Scale Manager，画布
    // 固定 960x540 CSS 像素居中，大窗口下四周全是黑。FIT=等比放大铺满窗口
    // 短边，letterbox 余量由 index.html 的暗化 keyart 页面背景兜住。
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    backgroundColor: '#0b0e1a',
    // Enables `scene.add.dom(...)` so the dialogue input can live inside the
    // canvas (kept aligned to game coords by Phaser across scaling/letterboxing).
    dom: { createContainer: true },
    scene: combatCoreSlice ? [CombatCoreScene] : defaultScenes,
  })
})
