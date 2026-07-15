import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { battleRuntimeForCampaign } from '../src/adapters/battleRuntimeRoute'
import { BattleRuntimeInput } from '../src/adapters/battleRuntimeInput'

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('BattleRuntimeScene shell boundary', () => {
  it('opts only sl11 into the production runtime behind an explicit query flag', () => {
    expect(battleRuntimeForCampaign(0, '?battleRuntime=1')).toBe('production')
    expect(battleRuntimeForCampaign(1, '?battleRuntime=1')).toBe('legacy')
    expect(battleRuntimeForCampaign(0, '')).toBe('legacy')
  })

  it('maps keyboard edges to ordered future-tick battle commands', () => {
    const input = new BattleRuntimeInput()
    expect(input.sample('hero-1', 4, {
      left: false, right: true, jump: false, attack: true, interact: false, skillId: 'slz',
    }))
      .toEqual([
        { actorId: 'hero-1', sequence: 1, atTick: 4, type: 'press-right' },
        { actorId: 'hero-1', sequence: 2, atTick: 4, type: 'press-attack' },
        { actorId: 'hero-1', sequence: 3, atTick: 4, type: 'press-skill', skillId: 'slz' },
      ])
    expect(input.sample('hero-1', 5, {
      left: false, right: false, jump: false, attack: false, interact: true, skillId: null,
    }))
      .toEqual([
        { actorId: 'hero-1', sequence: 4, atTick: 5, type: 'release-right' },
        { actorId: 'hero-1', sequence: 5, atTick: 5, type: 'press-interact' },
      ])
  })

  it('keeps combat and encounter formulas out of the Phaser host', () => {
    const scene = read('../src/scenes/BattleRuntimeScene.ts')
    expect(scene).toMatch(/new BattleRuntime\(/)
    expect(scene).toMatch(/runtime\.enqueue\(/)
    expect(scene).toMatch(/runtime\.step\(/)
    expect(scene).toMatch(/runtime\.getSnapshot\(/)
    expect(scene).not.toMatch(/applyPhysicsDefense|advanceMonster|advanceEncounter|stats\.hp\s*[-+]=|localStorage/)
  })
})
