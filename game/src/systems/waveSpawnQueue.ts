import { expandMonsterSpawnRoster, type MonsterSpawnSpec } from './level'

export interface PendingWaveSpawn {
  spec: MonsterSpawnSpec
  remainingMs: number
  sequence: number
}

export function waveMonsterCapacity(coop: boolean): number {
  return coop ? 8 : 6
}

export function createWaveSpawnQueue(roster: MonsterSpawnSpec[]): PendingWaveSpawn[] {
  return expandMonsterSpawnRoster(roster)
    .map((spec, sequence) => ({ spec, remainingMs: spec.delayMs ?? 0, sequence }))
    .sort((a, b) => a.remainingMs - b.remainingMs || a.sequence - b.sequence)
}

export function advanceWaveSpawnQueue(
  queue: PendingWaveSpawn[],
  deltaMs: number,
  availableSlots: number,
): MonsterSpawnSpec[] {
  const elapsed = Math.max(0, deltaMs)
  for (const pending of queue) pending.remainingMs -= elapsed

  const spawns: MonsterSpawnSpec[] = []
  let slots = Math.max(0, Math.floor(availableSlots))
  while (slots > 0 && queue.length > 0 && queue[0].remainingMs <= 0) {
    spawns.push(queue.shift()!.spec)
    slots -= 1
  }
  return spawns
}
