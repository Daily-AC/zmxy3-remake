import { describe, expect, it } from 'vitest'
import { selectBossHudMonster, type BossHudMonster } from '../src/systems/bossHud'

const monster = (id: string, mode: BossHudMonster['mode'] = 'patrol'): BossHudMonster => ({
  id,
  mode,
  hp: mode === 'dead' || mode === 'gone' ? 0 : 100,
  arenaBoss: false,
  miniBoss: true,
})

describe('boss HUD selection', () => {
  it('switches from a dead displayed miniboss to another living miniboss', () => {
    const first = monster('monster4')
    const second = monster('monster2')
    expect(selectBossHudMonster(null, second, [first, second])).toBe(second)

    second.mode = 'dead'
    second.hp = 0
    expect(selectBossHudMonster(null, second, [first, second])).toBe(first)
  })

  it('keeps an arena boss above miniboss candidates until its death animation is gone', () => {
    const arena = { ...monster('monster3', 'dead'), arenaBoss: true, miniBoss: false }
    const miniboss = monster('monster4')
    expect(selectBossHudMonster(arena, miniboss, [arena, miniboss])).toBe(arena)

    arena.mode = 'gone'
    expect(selectBossHudMonster(arena, miniboss, [arena, miniboss])).toBe(miniboss)
  })
})
