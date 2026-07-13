import type { CombatCommand } from '@zaixu/game-core'

export interface CombatKeyState {
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
}

export class CombatCoreInput {
  private previous: CombatKeyState = {
    left: false,
    right: false,
    jump: false,
    attack: false,
  }
  private sequence = 0

  sample(actorId: string, tick: number, current: CombatKeyState): CombatCommand[] {
    const commands: CombatCommand[] = []
    const push = (type: CombatCommand['type']): void => {
      this.sequence += 1
      commands.push({ actorId, sequence: this.sequence, atTick: tick, type })
    }
    if (current.left && !this.previous.left) push('press-left')
    if (!current.left && this.previous.left) push('release-left')
    if (current.right && !this.previous.right) push('press-right')
    if (!current.right && this.previous.right) push('release-right')
    if (current.jump && !this.previous.jump) push('press-jump')
    if (current.attack && !this.previous.attack) push('press-attack')
    this.previous = { ...current }
    return commands
  }
}
