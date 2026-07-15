import type { BattleDefinition, CombatActorSnapshot } from '@zaixu/game-core'

export interface BattleActorPresentation {
  texture: string
  animationPrefix: string
  offset: { x: number; y: number }
  scale: number
}

export function speciesForActor(actor: CombatActorSnapshot): string | null {
  if (actor.kind === 'hero') return null
  return String(actor.contentId).split('.').at(-1) ?? null
}

export function presentationForActor(
  definition: BattleDefinition,
  actor: CombatActorSnapshot,
): BattleActorPresentation {
  if (actor.kind === 'hero') {
    return {
      texture: 'runtime-role1',
      animationPrefix: 'runtime-hero-',
      offset: definition.hero.collisionOffset,
      scale: 1.5,
    }
  }
  const species = speciesForActor(actor)
  if (!species || !definition.monsters[species]) throw new Error(`unknown actor presentation: ${actor.contentId}`)
  return {
    texture: `runtime-${species}`,
    animationPrefix: `runtime-${species}-`,
    offset: definition.monsters[species].collisionOffset,
    scale: 1.5,
  }
}

export function snapshotAction(actor: CombatActorSnapshot): string {
  if (actor.lifeState === 'dead' || actor.lifeState === 'removed') return actor.kind === 'hero' ? 'hurt' : 'dead'
  if (actor.lifeState === 'hurt') return 'hurt'
  return actor.action
}
