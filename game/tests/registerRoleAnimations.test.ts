import { TICK_MS } from '@zaixu/game-core'
import { describe, expect, it } from 'vitest'
import { registerRoleAnimations } from '../src/presentation/registerRoleAnimations'
import type { RoleData } from '../src/systems/roleData'

describe('registerRoleAnimations', () => {
  it('uses extracted frame durations, loop flags, prefixes, and existing-animation guards', () => {
    const created: unknown[] = []
    const anims = {
      exists: (key: string) => key === 'role_wait',
      create: (config: unknown) => created.push(config),
    } as unknown as Parameters<typeof registerRoleAnimations>[0]
    const data: RoleData = {
      sheet: { cols: 2, rows: 1, cellW: 20, cellH: 20, facing: 'left' },
      offset: { x: 0, y: 0 },
      actions: {
        wait: { col: 0, row: 0, frames: 1, stopCounts: [2] },
        hit1: { col: 0, row: 0, frames: 2, stopCounts: [2, 3] },
      },
    }

    registerRoleAnimations(anims, data, 'role-texture', new Set(['hit1']), 'role_')

    expect(created).toEqual([{
      key: 'role_hit1',
      frames: [
        { key: 'role-texture', frame: 0, duration: 2 * TICK_MS },
        { key: 'role-texture', frame: 1, duration: 3 * TICK_MS },
      ],
      repeat: -1,
    }])
  })
})
