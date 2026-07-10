import type { MonsterStateSnapshot } from './coopSync'

export function missingHostMonsterSnapshots(
  localMonsterIds: ReadonlySet<string>,
  hostSnapshots: MonsterStateSnapshot[],
): MonsterStateSnapshot[] {
  return hostSnapshots.filter((snapshot) => !localMonsterIds.has(snapshot.monsterId))
}
