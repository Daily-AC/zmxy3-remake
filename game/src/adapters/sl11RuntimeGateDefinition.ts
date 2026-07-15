import type { BattleDefinition } from '@zaixu/game-core'
import { compileSl11BattleDefinition } from './sl11BattleDefinition'

/**
 * Browser-gate fixture: keep the production runtime and command path while
 * shortening the encounter so CI can prove the complete host lifecycle.
 */
export function compileSl11RuntimeGateDefinition(seed: number): BattleDefinition {
  const definition = compileSl11BattleDefinition(seed)
  const encounter = definition.level.encounters[0]
  if (encounter.kind !== 'continuous') throw new Error('sl11 gate expects a continuous encounter')
  const { x, y } = definition.level.heroSpawn
  encounter.initialDelayTicks = 999_999
  encounter.trigger.atOrAboveY = y
  encounter.trigger.boss.x = x
  encounter.trigger.boss.y = y
  definition.monsters.monster3.stats.hp = 1
  definition.monsters.monster3.stats.def = 0
  definition.monsters.monster3.stats.normalAttackRate = 0
  definition.level.door = { x: x - 150, y: y - 50, width: 300, height: 80 }
  return definition
}

export function useSl11RuntimeGate(search: string): boolean {
  return new URLSearchParams(search).get('runtimeDebug') === 'gate'
}
