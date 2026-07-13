import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HERO_COMBAT_CONFIG,
  HeroCombatTuning,
  HeroHit,
  createHeroCombat,
  applyHeroDamage,
  updateHeroCombat,
  isHeroInvulnerable,
  isHeroCombatDead,
} from '../src/combat/heroCombat'

const bounds = { minX: 0, maxX: 1000 }

function hit(partial: Partial<HeroHit> = {}): HeroHit {
  return { sourceId: 'monster-1', attackId: 1, damage: 15, knockbackX: 1, ...partial }
}

describe('heroCombat (受伤/受击条/死亡/复活)', () => {
  it('honors configured max HP and respawn delay', () => {
    const config = {
      ...DEFAULT_HERO_COMBAT_CONFIG,
      maxHp: 40,
      respawnDelayMs: 300,
    }
    const hero = createHeroCombat(config)
    const pos = { x: 500 }

    expect(hero.hp).toBe(40)
    expect(applyHeroDamage(hero, hit({ damage: 40 }), 1000, config)).toEqual([{ type: 'death' }])
    expect(hero.respawnAtMs).toBe(1300)
    expect(updateHeroCombat(hero, pos, bounds, 1299, 16, undefined, config)).toEqual([])
    expect(updateHeroCombat(hero, pos, bounds, 1300, 16, undefined, config)).toEqual([{ type: 'respawn' }])
    expect(hero.hp).toBe(40)
  })

  it('starts at full HP and ready', () => {
    const hero = createHeroCombat()
    expect(hero.hp).toBe(HeroCombatTuning.maxHp)
    expect(hero.state).toBe('ready')
    expect(isHeroCombatDead(hero)).toBe(false)
  })

  it('applies damage and enters hurt without granting a global per-hit i-frame', () => {
    const hero = createHeroCombat()
    const events = applyHeroDamage(hero, hit({ damage: 15 }), 1000)
    expect(events).toEqual([{ type: 'hurt' }])
    expect(hero.hp).toBe(HeroCombatTuning.maxHp - 15)
    expect(hero.state).toBe('hurt')
    expect(isHeroInvulnerable(hero, 1000)).toBe(false)
  })

  it('allows distinct attack instances to damage during the same hurt pose', () => {
    const hero = createHeroCombat()
    applyHeroDamage(hero, hit({ attackId: 1 }), 1000)
    const events = applyHeroDamage(hero, hit({ attackId: 2 }), 1000)
    expect(events).toEqual([{ type: 'hurt' }])
    expect(hero.hp).toBe(HeroCombatTuning.maxHp - 30)
  })

  it('dedups the same (sourceId, attackId) even after i-frames would have expired', () => {
    const hero = createHeroCombat()
    applyHeroDamage(hero, hit({ attackId: 7 }), 1000)
    const hpAfterFirst = hero.hp
    // Same attack instance retried much later: still consumed by the first
    // resolution, must not land twice regardless of invulnerability state.
    const events = applyHeroDamage(hero, hit({ attackId: 7 }), 5000)
    expect(events).toEqual([])
    expect(hero.hp).toBe(hpAfterFirst)
  })

  it('preserves explicit hard invulnerability without consuming a blocked attack id', () => {
    const hero = createHeroCombat()
    hero.invulnerableUntilMs = 1500

    expect(applyHeroDamage(hero, hit({ attackId: 11 }), 1200)).toEqual([])
    expect(hero.hp).toBe(hero.maxHp)
    expect(hero.resolvedHitIds).not.toContain('monster-1:11')
    expect(applyHeroDamage(hero, hit({ attackId: 11 }), 1600)).toEqual([{ type: 'hurt' }])
    expect(hero.hp).toBe(hero.maxHp - 15)
  })

  it('hurt state times out back to ready via updateHeroCombat', () => {
    const hero = createHeroCombat()
    const pos = { x: 500 }
    applyHeroDamage(hero, hit(), 1000)
    updateHeroCombat(hero, pos, bounds, 1000 + HeroCombatTuning.hurtDurationMs - 1, 16)
    expect(hero.state).toBe('hurt')
    updateHeroCombat(hero, pos, bounds, 1000 + HeroCombatTuning.hurtDurationMs, 16)
    expect(hero.state).toBe('ready')
  })

  it('applies x-only knockback that decays over time and clamps to bounds', () => {
    const hero = createHeroCombat()
    const pos = { x: 500 }
    applyHeroDamage(hero, hit({ knockbackX: 1 }), 1000)
    expect(hero.knockbackVelocityX).toBeGreaterThan(0)
    updateHeroCombat(hero, pos, bounds, 1016, 16)
    expect(pos.x).toBeGreaterThan(500) // pushed in +x
    let v = hero.knockbackVelocityX
    for (let t = 1032; t < 3000 && v > 0; t += 16) {
      updateHeroCombat(hero, pos, bounds, t, 16)
      v = hero.knockbackVelocityX
    }
    expect(hero.knockbackVelocityX).toBe(0) // decayed to a stop

    // Clamp check: a large knockback must not push past maxX.
    const hero2 = createHeroCombat()
    const pos2 = { x: 990 }
    applyHeroDamage(hero2, hit({ knockbackX: 50 }), 1000)
    updateHeroCombat(hero2, pos2, bounds, 1016, 16)
    expect(pos2.x).toBeLessThanOrEqual(bounds.maxX)
  })

  it('knocks back in the negative direction when knockbackX is negative', () => {
    const hero = createHeroCombat()
    const pos = { x: 500 }
    applyHeroDamage(hero, hit({ knockbackX: -1 }), 1000)
    updateHeroCombat(hero, pos, bounds, 1016, 16)
    expect(pos.x).toBeLessThan(500)
  })

  it('trips the hit-meter guard after enough dense hits and grants ~3s protection', () => {
    const hero = createHeroCombat()
    const pos = { x: 500 }
    let t = 1000
    let sourceCounter = 0
    let trippedAt = -1
    for (let i = 0; i < 30 && hero.meterInvulnerableUntilMs === undefined; i++) {
      sourceCounter += 1
      const events = applyHeroDamage(
        hero,
        { sourceId: 'monster-1', attackId: sourceCounter, damage: 1, knockbackX: 0 },
        t,
      )
      if (events.some((e) => e.type === 'hurt')) {
        // landed; meter may have tripped on this call
        if (hero.meterInvulnerableUntilMs !== undefined) trippedAt = t
      }
      t += 100
    }
    expect(hero.meterInvulnerableUntilMs).toBeDefined()
    expect(hero.hitMeter).toBe(0) // reset on trip

    // While meter-invulnerable, a new attack instance is rejected.
    const hpAtTrip = hero.hp
    const events = applyHeroDamage(
      hero,
      { sourceId: 'monster-1', attackId: sourceCounter + 1, damage: 1, knockbackX: 0 },
      trippedAt + 100,
    )
    expect(events).toEqual([])
    expect(hero.hp).toBe(hpAtTrip)
    expect(isHeroInvulnerable(hero, trippedAt + 100)).toBe(true)
    expect(hero.resolvedHitIds).not.toContain(`monster-1:${sourceCounter + 1}`)

    // Protection lifts once the ~3s window has fully elapsed.
    updateHeroCombat(hero, pos, bounds, trippedAt + HeroCombatTuning.hitMeterProtectionMs, 16)
    expect(hero.meterInvulnerableUntilMs).toBeUndefined()
    expect(applyHeroDamage(
      hero,
      { sourceId: 'monster-1', attackId: sourceCounter + 1, damage: 1, knockbackX: 0 },
      trippedAt + HeroCombatTuning.hitMeterProtectionMs,
    )).toEqual([{ type: 'hurt' }])
    expect(hero.hp).toBe(hpAtTrip - 1)
  })

  it('dies at HP <= 0 and schedules a respawn', () => {
    const hero = createHeroCombat()
    const events = applyHeroDamage(hero, hit({ damage: HeroCombatTuning.maxHp + 999 }), 1000)
    expect(events).toEqual([{ type: 'death' }])
    expect(hero.hp).toBe(0)
    expect(hero.state).toBe('dead')
    expect(isHeroCombatDead(hero)).toBe(true)
    expect(hero.respawnAtMs).toBe(1000 + HeroCombatTuning.respawnDelayMs)
  })

  it('ignores further hits once dead', () => {
    const hero = createHeroCombat()
    applyHeroDamage(hero, hit({ attackId: 1, damage: 999 }), 1000)
    const events = applyHeroDamage(hero, hit({ attackId: 2, damage: 999 }), 1010)
    expect(events).toEqual([])
    expect(hero.state).toBe('dead')
  })

  it('auto-respawns at full HP in place once the respawn delay elapses', () => {
    const hero = createHeroCombat()
    const pos = { x: 500 }
    applyHeroDamage(hero, hit({ damage: 999 }), 1000)
    const deathAt = 1000
    const respawnAt = hero.respawnAtMs as number

    let events = updateHeroCombat(hero, pos, bounds, respawnAt - 1, 16)
    expect(events).toEqual([])
    expect(hero.state).toBe('dead')
    expect(pos.x).toBe(500) // untouched pre-respawn

    events = updateHeroCombat(hero, pos, bounds, respawnAt, 16)
    expect(events).toEqual([{ type: 'respawn' }])
    expect(hero.state).toBe('ready')
    expect(hero.hp).toBe(hero.maxHp)
    expect(pos.x).toBe(500) // respawned in place (no respawnX given)
    expect(deathAt).toBeLessThan(respawnAt)
  })

  it('respawns at a given spawn point when respawnX is provided', () => {
    const hero = createHeroCombat()
    const pos = { x: 700 }
    applyHeroDamage(hero, hit({ damage: 999 }), 1000)
    const respawnAt = hero.respawnAtMs as number
    updateHeroCombat(hero, pos, bounds, respawnAt, 16, 120)
    expect(hero.state).toBe('ready')
    expect(pos.x).toBe(120)
  })

  it('resolvedHitIds and timers are cleared on respawn (old attackIds can land again)', () => {
    const hero = createHeroCombat()
    const pos = { x: 500 }
    applyHeroDamage(hero, hit({ sourceId: 'm', attackId: 1, damage: 999 }), 1000)
    const respawnAt = hero.respawnAtMs as number
    updateHeroCombat(hero, pos, bounds, respawnAt, 16)

    const events = applyHeroDamage(hero, hit({ sourceId: 'm', attackId: 1, damage: 10 }), respawnAt + 10)
    expect(events).toEqual([{ type: 'hurt' }])
    expect(hero.hp).toBe(hero.maxHp - 10)
  })
})
