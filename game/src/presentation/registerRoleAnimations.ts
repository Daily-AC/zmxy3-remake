import { TICK_MS } from '@zaixu/game-core/tick'
import type Phaser from 'phaser'
import { actionFrameTimings, type ActionSpec, type RoleData } from '../systems/roleData'

export function registerRoleAnimations(
  anims: Phaser.Animations.AnimationManager,
  data: RoleData,
  texture: string,
  loopingActions: ReadonlySet<string>,
  prefix: string,
): void {
  for (const [name, spec] of Object.entries(data.actions)) {
    const key = prefix + name
    if (anims.exists(key)) continue
    const frames = actionFrameTimings(data.sheet, spec as ActionSpec, TICK_MS).map((timing) => ({
      key: texture,
      frame: timing.index,
      duration: timing.durationMs,
    }))
    anims.create({ key, frames, repeat: loopingActions.has(name) ? -1 : 0 })
  }
}
