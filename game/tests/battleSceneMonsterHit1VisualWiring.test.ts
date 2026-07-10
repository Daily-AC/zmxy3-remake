import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('../src/scenes/BattleScene.ts', import.meta.url), 'utf8')

function methodBody(name: string, nextName: string): string {
  const text = source()
  return text.slice(text.indexOf(`private ${name}`), text.indexOf(`private ${nextName}`))
}

describe('BattleScene official monster hit1 visual wiring', () => {
  it('preloads and registers the official per-frame effect assets', () => {
    expect(source()).toContain('monsterHit1EffectFrameKey(phase, frame)')
    expect(source()).toContain('this.registerMonsterHit1Effects()')
    expect(source()).toContain('monsterHit1EffectAnimationKey(phase)')
  })

  it('passes the attack frame index through so Monster2 can select both phases', () => {
    expect(source()).toContain('this.resolveMonsterAttackFrame(e, ev.attackFrameIndex ?? 0)')
    expect(source()).toContain('monsterHit1VisualForAttackFrame(e.species, attackFrameIndex)')
  })

  it('places, pivots, flips, and destroys transient effects from resolved.effect', () => {
    const body = methodBody('spawnMonsterHit1Effect', 'sendRemoteHeroHits')
    expect(body).toContain('.setDisplayOrigin(resolved.originX, resolved.originY)')
    expect(body).toContain('.setFlipX(resolved.flipX)')
    expect(body).toContain('Phaser.Animations.Events.ANIMATION_COMPLETE')
    expect(body).toContain('sprite.destroy()')
  })

  it('replaces the Monster30 gray circles with the official animated sprite', () => {
    const body = methodBody('makeEnemyProjectileSprite', 'stepEnemyProjectiles')
    expect(body).toContain("monsterHit1VisualForAttackFrame('monster30', 0)")
    expect(body).toContain('monsterHit1EffectAnimationKey(visual.phase)')
    expect(body).not.toContain('this.add.circle')
  })
})
