import { describe, expect, it } from 'vitest'
import { BattleRuntime } from '@zaixu/game-core'
import { compileSl11BattleDefinition } from '../src/adapters/sl11BattleDefinition'
import {
  compileSl11RuntimeGateDefinition,
  useSl11RuntimeGate,
} from '../src/adapters/sl11RuntimeGateDefinition'

describe('sl11 runtime browser gate', () => {
  it('is enabled only by the explicit gate query', () => {
    expect(useSl11RuntimeGate('?runtimeDebug=gate')).toBe(true)
    expect(useSl11RuntimeGate('?battleRuntime=1')).toBe(false)
    expect(useSl11RuntimeGate('?runtimeDebug=1')).toBe(false)
  })

  it('shortens the browser encounter without changing production content', () => {
    const gate = compileSl11RuntimeGateDefinition(0x5a17)
    const production = compileSl11BattleDefinition(0x5a17)
    const gateEncounter = gate.level.encounters[0]
    const productionEncounter = production.level.encounters[0]
    if (gateEncounter.kind !== 'continuous' || productionEncounter.kind !== 'continuous') {
      throw new Error('expected continuous sl11 encounters')
    }

    expect(gateEncounter.trigger.atOrAboveY).toBe(gate.level.heroSpawn.y)
    expect(gate.monsters.monster3.stats.hp).toBe(1)
    expect(productionEncounter.trigger.atOrAboveY).toBe(-1900)
    expect(production.monsters.monster3.stats.hp).toBeGreaterThan(1)
    expect(() => new BattleRuntime(gate)).not.toThrow()
  })
})
