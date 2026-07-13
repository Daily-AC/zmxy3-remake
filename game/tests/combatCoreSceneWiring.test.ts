import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GAME_VERSION } from '../src/buildInfo'

const gameRoot = fileURLToPath(new URL('..', import.meta.url))
const readSource = (path: string): string => readFileSync(`${gameRoot}/${path}`, 'utf8')

describe('combat core slice wiring', () => {
  it('keeps the default scene order and gates the proof slice behind its query flag', () => {
    const source = readSource('src/main.ts')
    const expectedOrder = [
      'MainMenuScene',
      'LoginScene',
      'LobbyScene',
      'SlotSelectScene',
      'CharacterSelectScene',
      'WorldMapScene',
      'SkillTreeScene',
      'BattleLoadingScene',
      'BattleScene',
    ]

    expect(source).toContain("searchParams.get('combatCoreSlice') === '1'")
    expect(source).toContain('scene: combatCoreSlice ? [CombatCoreScene] : defaultScenes')
    let cursor = -1
    for (const scene of expectedOrder) {
      const next = source.indexOf(scene, cursor + 1)
      expect(next).toBeGreaterThan(cursor)
      cursor = next
    }
  })

  it('loads only the proof slice real-asset allowlist and all configured effect frames', () => {
    const source = readSource('src/scenes/CombatCoreScene.ts')
    const requiredAssets = [
      'assets/extracted/role1_0.png',
      'assets/extracted/role1_equip0.png',
      'assets/extracted/level1/Monster7.png',
      'assets/extracted/level1/bg12.png',
      'assets/extracted/level1/online_floor12.png',
      'assets/audio/Role1_hit1AndHit2.mp3',
      'assets/audio/Role1_hit3AndHit4.mp3',
      'assets/audio/Role1_hit5.mp3',
      'assets/audio/BeattackByRole1.mp3',
    ]

    for (const asset of requiredAssets) expect(source).toContain(asset)
    expect(source).toContain('ROLE1_EFFECTS')
    expect(source).toContain('for (let frame = 1; frame <= effect.frames; frame += 1)')
    expect(source.match(/this\.load\.(?:spritesheet|image|audio)\(/g)).toHaveLength(10)
    expect(source).not.toMatch(/generateTexture|createCanvas|placeholder/i)
  })

  it('uses the fixed-step core, exact visual offsets, and an observation-only hook', () => {
    const source = readSource('src/scenes/CombatCoreScene.ts')

    expect(source).toContain("super({ key: 'combat-core-slice' })")
    expect(source).toContain('Math.min(deltaMs, TICK_MS * 8)')
    expect(source).toContain('actor.x + actorDef.collisionOffset.x')
    expect(source).toContain('actor.y + actorDef.collisionOffset.y')
    expect(source).toContain('.setDisplayOrigin(placement.originX, placement.originY)')
    expect(source).not.toContain('.setOrigin(placement.originX, placement.originY)')
    expect(source).toContain('structuredClone')
    expect(source).toContain('delete window.__combatCoreSlice')
    expect(source).toContain('getDeterminismProof')
    expect(source).toContain('captureBugBundle')
    expect(source).toContain('SingleFlightSnapshotCapture')
    expect(source).toContain('this.screenshotCapture.shutdown')
    expect(source).toContain('getEvents: () => structuredClone')
    expect(source).toContain('getCommands: () => structuredClone')
    expect(source).toContain('getPresentationCues: () => structuredClone')
    expect(source).toContain('reset: () => this.scene.restart()')
    expect(source).toContain('if (this.visualBaseline) return')
    expect(source).toContain('this.hitStopGate.requestAction')
    expect(source).toContain('this.releaseHitStop')
    expect(source).not.toContain('this.hitStopActors.clear()')
    expect(source).not.toContain('if (this.hitStopGate.hasActiveStops()) return')
    expect(source).not.toMatch(/window\.__combatCoreSlice\s*=\s*\{[^}]*?(step|enqueue|mutate)\s*:/s)
  })

  it('preserves the sourced Wukong death fallback and synchronized weapon state', () => {
    const source = readSource('src/scenes/CombatCoreScene.ts')

    expect(source).toContain("lifeState === 'dead'")
    expect(source).toContain("sprite.play('hurt')")
    expect(source).toContain("this.weapon.play('weapon_hurt')")
    expect(source).toContain('setAngle')
    expect(source).toContain('setTint(0x9c9c9c)')
  })

  it('retains optimized loader integration and emits structured loader lifecycle logs', () => {
    const main = readSource('src/main.ts')
    const source = readSource('src/scenes/CombatCoreScene.ts')

    expect(main).toContain('installOptimizedImageLoader')
    expect(source).toContain("this.load.once('start'")
    expect(source).toContain("this.load.on('progress'")
    expect(source).toContain("this.load.once('complete'")
  })

  it('injects the game package version at build time', () => {
    const vite = readSource('vite.config.ts')
    const buildInfo = readSource('src/buildInfo.ts')
    const env = readSource('src/vite-env.d.ts')
    const packageJson = JSON.parse(readSource('package.json')) as { version: string }

    expect(vite).toContain("./package.json")
    expect(vite).toContain('__GAME_VERSION__')
    expect(buildInfo).toContain('GAME_VERSION = __GAME_VERSION__')
    expect(env).toContain('declare const __GAME_VERSION__: string')
    expect(GAME_VERSION).toBe(packageJson.version)
  })
})
