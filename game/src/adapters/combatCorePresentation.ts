import type { CombatEvent } from '@zaixu/game-core'
import {
  PRESENTATION_CONTRACT_VERSION,
  type PresentationCue,
} from '@zaixu/presentation-contract'
import {
  role1SwingEffectAction,
  role1SwingSound,
} from '../presentation/role1AttackPresentation'

interface CombatPresentationPayloadMap {
  swing: { actorId: string; action: string; effect: string | null; sound: string | null }
  impact: { sourceId: string; targetId: string; hitStopMs: 50 }
  'damage-number': { actorId: string; amount: number }
  animation: { actorId: string; action: string }
  defeated: { actorId: string }
  removed: { actorId: string }
  respawn: { actorId: string }
}

export type CombatPresentationCue = {
  [K in keyof CombatPresentationPayloadMap]: PresentationCue<K, CombatPresentationPayloadMap[K]>
}[keyof CombatPresentationPayloadMap]

function cue<K extends keyof CombatPresentationPayloadMap>(
  tick: number,
  type: K,
  payload: CombatPresentationPayloadMap[K],
): PresentationCue<K, CombatPresentationPayloadMap[K]> {
  return { presentationVersion: PRESENTATION_CONTRACT_VERSION, tick, type, payload }
}

export function presentationCuesFor(event: CombatEvent): CombatPresentationCue[] {
  switch (event.type) {
    case 'attack-started': {
      const effectAction = event.sourceId === 'hero-1' && event.airborne ? 'hit3' : event.action
      return [cue(event.tick, 'swing', {
        actorId: event.sourceId,
        action: event.action,
        effect: event.sourceId === 'hero-1' ? role1SwingEffectAction(effectAction) : null,
        sound: event.sourceId === 'hero-1' ? role1SwingSound(event.action) : null,
      })]
    }
    case 'hit-confirmed':
      return [cue(event.tick, 'impact', {
        sourceId: event.sourceId,
        targetId: event.targetId,
        hitStopMs: 50,
      })]
    case 'damage-applied':
      return [cue(event.tick, 'damage-number', {
        actorId: event.targetId,
        amount: event.amount,
      })]
    case 'actor-staggered':
      return [cue(event.tick, 'animation', { actorId: event.actorId, action: 'hurt' })]
    case 'actor-defeated':
      return [cue(event.tick, 'defeated', { actorId: event.actorId })]
    case 'actor-removed':
      return [cue(event.tick, 'removed', { actorId: event.actorId })]
    case 'actor-respawned':
      return [cue(event.tick, 'respawn', { actorId: event.actorId })]
    case 'command-rejected':
      return []
  }
}
