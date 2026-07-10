import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { battleLoadingContext, battleLoadingStatusFrames } from '../src/scenes/battleLoadingContent'

const source = () => readFileSync(new URL('../src/scenes/BattleLoadingScene.ts', import.meta.url), 'utf8')

describe('BattleLoadingScene', () => {
  it('maps the first two campaign indices to exact level and context copy', () => {
    expect(battleLoadingContext(0)).toMatchObject({
      name: '九重天',
      label: '第 1 关 · 九重天',
      context: '正在推演九重天',
    })
    expect(battleLoadingContext(1)).toMatchObject({
      name: '天宫道',
      label: '第 2 关 · 天宫道',
      context: '正在推演天宫道',
    })
  })

  it('cycles at least three Journey to the West status lines with zero to three dots', () => {
    const solo = battleLoadingStatusFrames(false)
    const coop = battleLoadingStatusFrames(true)
    expect(new Set(solo.map((frame) => frame.replace(/\.+$/, '')))).toEqual(
      new Set(['校准云路', '推演妖阵', '整备行囊']),
    )
    expect(new Set(coop.map((frame) => frame.replace(/\.+$/, '')))).toEqual(
      new Set(['校准云路', '推演妖阵', '召集同伴']),
    )
    for (const phrase of ['校准云路', '推演妖阵', '整备行囊']) {
      expect(solo.filter((frame) => frame.startsWith(phrase))).toEqual([
        phrase,
        `${phrase}.`,
        `${phrase}..`,
        `${phrase}...`,
      ])
    }
  })

  it('renders a zero-asset ink loading screen with the requested title and campaign label', () => {
    const loading = source()
    expect(loading).toMatch(/drawInkBackdrop\(this\)/)
    expect(loading).toMatch(/activeArtFont\(\)\.family/)
    expect(loading).toMatch(/天庭推演中/)
    expect(loading).toMatch(/this\.loadingContext\.context/)
    expect(loading).toMatch(/battleData\.campaignIndex/)
    expect(loading).not.toMatch(/preload\s*\(/)
    expect(loading).not.toMatch(/this\.load\./)
  })

  it('clamps real BattleScene loader progress and publishes the acceptance hook', () => {
    const loading = source()
    expect(loading).toMatch(/Phaser\.Math\.Clamp\(value, 0, 1\)/)
    expect(loading).toMatch(/battle\.load\.on\('progress', this\.onLoadProgress\)/)
    expect(loading).toMatch(/__shellLoadingState/)
    expect(loading).toMatch(/active: true/)
    expect(loading).toMatch(/label: this\.levelLabel/)
    expect(loading).toMatch(/progress: this\.progress/)
    expect(loading).toMatch(/status: this\.status/)
  })

  it('launches battle with the original payload, stays above it, and stops only on ready', () => {
    const loading = source()
    expect(loading).toMatch(/this\.scene\.launch\(SCENE\.battle, this\.battleData\)/)
    expect(loading).toMatch(/this\.scene\.bringToTop\(SCENE\.battleLoading\)/)
    expect(loading).toMatch(/battle\.events\.once\(BATTLE_READY_EVENT, this\.onBattleReady\)/)
    expect(loading).toMatch(/this\.scene\.stop\(SCENE\.battleLoading\)/)
  })

  it('cycles a short three-dot status and clears every listener on shutdown', () => {
    const loading = source()
    expect(loading).toMatch(/battleLoadingStatusFrames/)
    expect(loading).toMatch(/loop: true/)
    expect(loading).toMatch(/battle\.load\.off\('progress', this\.onLoadProgress\)/)
    expect(loading).toMatch(/battle\.events\.off\(BATTLE_READY_EVENT, this\.onBattleReady\)/)
    expect(loading).toMatch(/delete .*__shellLoadingState/)
  })
})
