import { describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Input: { Keyboard: { KeyCodes: { A: 65, D: 68, J: 74, K: 75 } } },
  },
}))

describe('BattleScene visual regression helpers', () => {
  it('anchors floating damage above the visible pixels, not the sprite registration point', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      computeVisibleTopY: (input: {
        stateY: number
        offsetY: number
        scale: number
        cellH: number
        contentTop: number
        baselineCorrectionY?: number
      }) => number
    }

    expect(mod.computeVisibleTopY({
      stateY: 400,
      offsetY: -15,
      scale: 1.5,
      cellH: 200,
      contentTop: 72,
    })).toBeCloseTo(335.5)
  })

  it('aligns grounded species visual bottoms to WuKong while leaving flying crows uncorrected', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      monsterBaselineCorrectionY: (species: string) => number
    }

    expect(mod.monsterBaselineCorrectionY('monster3')).toBeCloseTo(9)
    expect(mod.monsterBaselineCorrectionY('monster30')).toBe(0)
  })

  it('keeps bg11 visible when the generated pillar texture is unavailable', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      climbBackgroundVisibility: (hasPillarTexture: boolean) => { pillar: boolean; fallback: boolean }
    }

    expect(mod.climbBackgroundVisibility(true)).toEqual({ pillar: true, fallback: false })
    expect(mod.climbBackgroundVisibility(false)).toEqual({ pillar: false, fallback: true })
  })

  it('excludes the mirrored rail seam from the pillar tile frame', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      pillarTileFrame: (sourceHeight: number) => { x: number; y: number; width: number; height: number }
    }

    expect(mod.pillarTileFrame(3132)).toEqual({ x: 0, y: 200, width: 864, height: 850 })
  })

  it('centers the complete boss nameplate plus HP bar footprint', async () => {
    const mod = await import('../src/ui/hud/MonsterHpBar') as unknown as {
      bossHpLayout: (barWidth: number) => { left: number; right: number; plateX: number; barX: number }
    }
    const layout = mod.bossHpLayout(360)

    expect(layout.left).toBeCloseTo(-layout.right)
    expect(layout.plateX).toBe(layout.left)
    expect(layout.barX).toBeGreaterThan(layout.plateX)
  })

  it('ships the generated ink-and-fire backing plate for the combo component', () => {
    const file = new URL('../public/assets/generated/combo-banner.png', import.meta.url)

    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file).subarray(1, 4).toString('ascii')).toBe('PNG')
  })

  it('renders each cure drop with a dedicated bitmap instead of a drawn orb', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      consumableTextureKey: (id: string) => string
    }

    expect(mod.consumableTextureKey('smallHp')).toBe('drop_cure_small_hp')
    expect(mod.consumableTextureKey('bigHp')).toBe('drop_cure_big_hp')
    expect(mod.consumableTextureKey('smallMp')).toBe('drop_cure_small_mp')
    for (const name of ['cure-small-hp.png', 'cure-big-hp.png', 'cure-small-mp.png']) {
      const file = new URL(`../public/assets/generated/${name}`, import.meta.url)
      expect(existsSync(file), name).toBe(true)
      expect(readFileSync(file).subarray(1, 4).toString('ascii'), name).toBe('PNG')
    }
  })

  it('starts the normal-attack effect on the swing, even when no monster is present', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      role1AttackEffectForSwing?: (
        previousAttackId: number,
        currentAttackId: number,
        comboStage: number,
      ) => string | null
    }

    expect(mod.role1AttackEffectForSwing).toBeTypeOf('function')
    expect(mod.role1AttackEffectForSwing!(0, 1, 1)).toBe('hit1')
    expect(mod.role1AttackEffectForSwing!(1, 2, 2)).toBe('hit1')
    expect(mod.role1AttackEffectForSwing!(2, 3, 3)).toBe('hit3')
    expect(mod.role1AttackEffectForSwing!(3, 3, 3)).toBeNull()
  })

  it('reports an empty or passive skill slot instead of silently swallowing the key press', async () => {
    const mod = await import('../src/scenes/BattleScene') as unknown as {
      boundSkillCastFailure?: (skillId: string | null) => 'not-learned' | 'passive' | null
    }

    expect(mod.boundSkillCastFailure).toBeTypeOf('function')
    expect(mod.boundSkillCastFailure!(null)).toBe('not-learned')
    expect(mod.boundSkillCastFailure!('sx')).toBe('passive')
    expect(mod.boundSkillCastFailure!('slz')).toBeNull()
  })
})
