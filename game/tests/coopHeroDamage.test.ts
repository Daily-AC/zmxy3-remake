import { describe, expect, it } from 'vitest'
import {
  remoteHeroHurtbox,
  resolveCoopHeroHitDamage,
  selectRemoteHeroHitTargets,
} from '../src/systems/coopHeroDamage'
import type { HeroStateSnapshot, HeroHitPayload } from '../src/systems/coopSync'

const hero = (partial: Partial<HeroStateSnapshot> = {}): HeroStateSnapshot => ({
  userId: 'u-peer',
  heroId: '1',
  x: 120,
  y: 360,
  facing: 1,
  action: 'ready',
  animState: 'ready',
  hp: 100,
  maxHp: 100,
  alive: true,
  ...partial,
})

const visual = {
  offset: { x: -5, y: -15 },
  scale: 1.5,
  hurtboxWidth: 90,
  hurtboxHeight: 150,
}

describe('coop hero damage', () => {
  it('builds a live remote hero hurtbox from the snapshot registration point and role offset', () => {
    expect(remoteHeroHurtbox(hero(), visual)).toEqual({
      x: 67.5,
      y: 262.5,
      w: 90,
      h: 150,
    })
    expect(remoteHeroHurtbox(hero({ alive: false }), visual)).toBeNull()
  })

  it('selects only overlapping live peers and derives knockback relative to the monster', () => {
    const targets = selectRemoteHeroHitTargets(
      { x: 50, y: 250, w: 160, h: 180 },
      150,
      [
        hero({ userId: 'u-host' }),
        hero({ userId: 'u-left', x: 100 }),
        hero({ userId: 'u-right', x: 200 }),
        hero({ userId: 'u-dead', x: 100, alive: false }),
        hero({ userId: 'u-away', x: 600 }),
      ],
      'u-host',
      visual,
    )

    expect(targets).toEqual([
      { targetUserId: 'u-left', knockbackX: -1 },
      { targetUserId: 'u-right', knockbackX: 1 },
    ])
  })

  it('applies the target peer equipment defense to the raw host payload', () => {
    const base: HeroHitPayload = {
      targetUserId: 'u-peer',
      sourceMonsterId: 'monster3-1',
      attackId: 'monster3-1:7',
      power: 186,
      attackKind: 'physics',
      knockbackX: -1,
    }

    expect(resolveCoopHeroHitDamage(base, 20, 0)).toBe(166)
    expect(resolveCoopHeroHitDamage({ ...base, power: 999, attackKind: 'magic' }, 0, 0.3)).toBe(699)
  })
})
