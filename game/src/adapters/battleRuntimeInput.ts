import type { BattleCommand } from '@zaixu/game-core'

export interface BattleRuntimeKeyState {
  left: boolean
  right: boolean
  jump: boolean
  attack: boolean
  interact: boolean
  skillId: string | null
}

const RELEASE_COMMAND = {
  left: 'release-left',
  right: 'release-right',
} as const

export class BattleRuntimeInput {
  private previous: BattleRuntimeKeyState = {
    left: false,
    right: false,
    jump: false,
    attack: false,
    interact: false,
    skillId: null,
  }
  private sequence = 0

  sample(actorId: string, tick: number, current: BattleRuntimeKeyState): BattleCommand[] {
    const commands: BattleCommand[] = []
    const push = (type: Exclude<BattleCommand['type'], 'press-skill'>): void => {
      commands.push({ actorId, sequence: ++this.sequence, atTick: tick, type })
    }
    if (current.left && !this.previous.left) push('press-left')
    if (!current.left && this.previous.left) push(RELEASE_COMMAND.left)
    if (current.right && !this.previous.right) push('press-right')
    if (!current.right && this.previous.right) push(RELEASE_COMMAND.right)
    if (current.jump && !this.previous.jump) push('press-jump')
    if (current.attack && !this.previous.attack) push('press-attack')
    if (current.interact && !this.previous.interact) push('press-interact')
    if (current.skillId && current.skillId !== this.previous.skillId) {
      commands.push({
        actorId,
        sequence: ++this.sequence,
        atTick: tick,
        type: 'press-skill',
        skillId: current.skillId,
      })
    }
    this.previous = { ...current }
    return commands
  }
}
