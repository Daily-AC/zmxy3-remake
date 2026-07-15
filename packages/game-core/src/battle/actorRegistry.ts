import type { MonsterState } from '../monster/monsterSim'
import { assertPlainData } from '../session/plainData'
import { cloneSerializable } from '../session/snapshot'
import type { ActorId } from '../session/types'

export interface BattleMonsterRecord {
  id: ActorId
  encounterId: string
  speciesId: string
  simulation: MonsterState
  attackId: number
  swingEventId: number
}

export interface BattleActorRegistryState {
  spawnOrdinals: Record<string, number>
  monsters: BattleMonsterRecord[]
}

function assertIdentityPart(value: string, name: string): void {
  if (value.length === 0 || value.includes(':')) {
    throw new TypeError(`${name} must be a non-empty value without colons`)
  }
}

function assertCounter(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`)
  }
}

export class BattleActorRegistry {
  private readonly monsters = new Map<ActorId, BattleMonsterRecord>()
  private readonly spawnOrdinals = new Map<string, number>()

  spawnMonster(
    levelId: string,
    encounterId: string,
    speciesId: string,
    simulation: MonsterState,
  ): ActorId {
    assertIdentityPart(levelId, 'levelId')
    assertIdentityPart(encounterId, 'encounterId')
    assertIdentityPart(speciesId, 'speciesId')
    const ordinal = this.spawnOrdinals.get(encounterId) ?? 0
    const id = `${levelId}:${encounterId}:${speciesId}:${String(ordinal).padStart(4, '0')}`
    if (this.monsters.has(id)) throw new Error(`duplicate actor id: ${id}`)
    this.spawnOrdinals.set(encounterId, ordinal + 1)
    this.monsters.set(id, {
      id,
      encounterId,
      speciesId,
      simulation: cloneSerializable(simulation),
      attackId: 0,
      swingEventId: 0,
    })
    return id
  }

  get(id: ActorId): BattleMonsterRecord | undefined {
    return this.monsters.get(id)
  }

  records(): BattleMonsterRecord[] {
    return [...this.monsters.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  livingCount(encounterId: string): number {
    let count = 0
    for (const record of this.monsters.values()) {
      if (record.encounterId !== encounterId) continue
      if (record.simulation.mode !== 'dead' && record.simulation.mode !== 'gone') count += 1
    }
    return count
  }

  removeGone(): ActorId[] {
    const removed = this.records()
      .filter((record) => record.simulation.mode === 'gone')
      .map((record) => record.id)
    for (const id of removed) this.monsters.delete(id)
    return removed
  }

  exportState(): BattleActorRegistryState {
    return cloneSerializable({
      spawnOrdinals: Object.fromEntries(
        [...this.spawnOrdinals].sort(([left], [right]) => left.localeCompare(right)),
      ),
      monsters: this.records(),
    })
  }

  static restore(input: BattleActorRegistryState): BattleActorRegistry {
    assertPlainData(input, 'battle actor registry state')
    const state = cloneSerializable(input)
    const registry = new BattleActorRegistry()

    for (const [encounterId, ordinal] of Object.entries(state.spawnOrdinals)) {
      assertIdentityPart(encounterId, 'encounterId')
      assertCounter(ordinal, `spawn ordinal for ${encounterId}`)
      registry.spawnOrdinals.set(encounterId, ordinal)
    }
    for (const record of state.monsters) {
      assertIdentityPart(record.encounterId, 'encounterId')
      assertIdentityPart(record.speciesId, 'speciesId')
      assertCounter(record.attackId, `attackId for ${record.id}`)
      assertCounter(record.swingEventId, `swingEventId for ${record.id}`)
      if (registry.monsters.has(record.id)) throw new Error(`duplicate restored actor id: ${record.id}`)
      registry.monsters.set(record.id, record)
    }
    return registry
  }
}
