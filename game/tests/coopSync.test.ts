import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RENDER_DELAY_MS,
  applyCoopMessage,
  createCoopSyncState,
  decodeCoopMessage,
  encodeCoopMessage,
  encodeHeroState,
  encodeHitIntent,
  encodeHitSettlement,
  encodeMonsterState,
  interpolatePosition,
  isStaleSeq,
  type HeroStateSnapshot,
  type MonsterStateSnapshot,
} from '../src/systems/coopSync'

const hero: HeroStateSnapshot = {
  userId: 'u-peer',
  heroId: 'wukong',
  x: 120,
  y: 360,
  facing: 1,
  action: 'run',
  animState: 'run-right',
  hp: 85,
  maxHp: 100,
  alive: true,
}

const monster: MonsterStateSnapshot = {
  monsterId: 'm-1',
  x: 500,
  y: 360,
  facing: -1,
  action: 'walk',
  hp: 50,
  maxHp: 50,
  alive: true,
}

describe('coopSync wire codec', () => {
  it('round-trips hero state, monster state, hit intent, and settlement messages', () => {
    const messages = [
      encodeHeroState(hero, 7, 1_000),
      encodeMonsterState([monster], 8, 1_100),
      encodeHitIntent({
        attackerUserId: 'u-peer',
        targetMonsterId: 'm-1',
        attackId: 'combo-3',
        skillId: 'hit3',
        clientTimeMs: 1_125,
      }),
      encodeHitSettlement({
        attackerUserId: 'u-peer',
        targetMonsterId: 'm-1',
        attackId: 'combo-3',
        damageDealt: 20,
        monsterHp: 30,
        monsterMaxHp: 50,
        monsterAlive: true,
        killed: false,
      }),
    ]

    for (const message of messages) {
      expect(decodeCoopMessage(encodeCoopMessage(message))).toEqual(message)
    }
  })

  it('rejects malformed coop frames without throwing', () => {
    expect(decodeCoopMessage('not json')).toBeNull()
    expect(decodeCoopMessage({ type: 'state', seq: 1, sentAt: 0, payload: { coopType: 'unknown' } })).toBeNull()
    expect(decodeCoopMessage({ type: 'event', name: 'hit_intent', payload: { targetMonsterId: 'm-1' } })).toBeNull()
  })
})

describe('coopSync sequence handling', () => {
  it('treats sequence numbers less than or equal to the last accepted value as stale', () => {
    expect(isStaleSeq(undefined, 1)).toBe(false)
    expect(isStaleSeq(2, 3)).toBe(false)
    expect(isStaleSeq(2, 2)).toBe(true)
    expect(isStaleSeq(2, 1)).toBe(true)
  })

  it('discards out-of-order state snapshots per sender', () => {
    const initial = createCoopSyncState({ localUserId: 'u-local', hostUserId: 'u-host' })
    const first = applyCoopMessage(initial, { ...encodeHeroState(hero, 2, 2_000), fromUserId: 'u-peer' })
    const staleHero = { ...hero, x: 999 }
    const stale = applyCoopMessage(first.state, { ...encodeHeroState(staleHero, 1, 1_900), fromUserId: 'u-peer' })

    expect(first.state.heroes['u-peer']?.snapshot.x).toBe(120)
    expect(stale.state.heroes['u-peer']?.snapshot.x).toBe(120)
    expect(stale.effects).toContainEqual({
      type: 'stale_state_discarded',
      fromUserId: 'u-peer',
      seq: 1,
      lastSeq: 2,
    })
  })
})

describe('coopSync interpolation', () => {
  it('interpolates between bracketing samples at now minus the render delay', () => {
    const position = interpolatePosition(
      [
        { timeMs: 0, x: 0, y: 10 },
        { timeMs: 100, x: 10, y: 20 },
        { timeMs: 200, x: 20, y: 30 },
      ],
      270,
      DEFAULT_RENDER_DELAY_MS,
    )

    expect(position).toEqual({ x: 15, y: 25 })
  })

  it('handles empty, single-sample, older-than-buffer, and newer-than-latest requests', () => {
    const samples = [
      { timeMs: 100, x: 10, y: 20 },
      { timeMs: 200, x: 30, y: 40 },
    ]

    expect(interpolatePosition([], 1_000)).toBeNull()
    expect(interpolatePosition([{ timeMs: 100, x: 10, y: 20 }], 1_000)).toEqual({ x: 10, y: 20 })
    expect(interpolatePosition(samples, 150, DEFAULT_RENDER_DELAY_MS)).toEqual({ x: 10, y: 20 })
    expect(interpolatePosition(samples, 500, DEFAULT_RENDER_DELAY_MS)).toEqual({ x: 30, y: 40 })
  })
})

describe('coopSync state machine', () => {
  it('lets peers accept host monster snapshots and ignore monster snapshots from non-hosts', () => {
    const peerState = createCoopSyncState({ localUserId: 'u-peer', hostUserId: 'u-host' })

    const accepted = applyCoopMessage(peerState, {
      ...encodeMonsterState([monster], 1, 1_000),
      fromUserId: 'u-host',
    })
    const rejected = applyCoopMessage(accepted.state, {
      ...encodeMonsterState([{ ...monster, hp: 1 }], 2, 1_100),
      fromUserId: 'u-other-peer',
    })

    expect(accepted.state.monsters['m-1']?.snapshot.hp).toBe(50)
    expect(accepted.effects).toContainEqual({ type: 'monster_updated', monsterId: 'm-1' })
    expect(rejected.state.monsters['m-1']?.snapshot.hp).toBe(50)
    expect(rejected.effects).toContainEqual({
      type: 'monster_state_ignored',
      fromUserId: 'u-other-peer',
      reason: 'non_host_sender',
    })
  })

  it('lets the host resolve hit intents into settlement events', () => {
    const hostState = {
      ...createCoopSyncState({ localUserId: 'u-host', hostUserId: 'u-host' }),
      monsters: {
        'm-1': { snapshot: monster, positionSamples: [{ timeMs: 1_000, x: monster.x, y: monster.y }] },
      },
    }

    const result = applyCoopMessage(
      hostState,
      {
        ...encodeHitIntent({
          attackerUserId: 'u-peer',
          targetMonsterId: 'm-1',
          attackId: 'combo-3',
          skillId: 'hit3',
          clientTimeMs: 1_125,
        }),
        fromUserId: 'u-peer',
      },
      {
        resolveHitIntent: () => ({ damageDealt: 35 }),
      },
    )

    expect(result.state.monsters['m-1']?.snapshot.hp).toBe(15)
    expect(result.outgoing).toEqual([
      encodeHitSettlement({
        attackerUserId: 'u-peer',
        targetMonsterId: 'm-1',
        attackId: 'combo-3',
        damageDealt: 35,
        monsterHp: 15,
        monsterMaxHp: 50,
        monsterAlive: true,
        killed: false,
      }),
    ])
    expect(result.effects).toContainEqual({
      type: 'hit_settlement_created',
      targetMonsterId: 'm-1',
      damageDealt: 35,
      monsterHp: 15,
      killed: false,
    })
  })

  it('lets peers apply settlement broadcasts and emit a death effect', () => {
    const peerState = {
      ...createCoopSyncState({ localUserId: 'u-peer', hostUserId: 'u-host' }),
      monsters: {
        'm-1': { snapshot: monster, positionSamples: [{ timeMs: 1_000, x: monster.x, y: monster.y }] },
      },
    }

    const result = applyCoopMessage(peerState, {
      ...encodeHitSettlement({
        attackerUserId: 'u-peer',
        targetMonsterId: 'm-1',
        attackId: 'combo-4',
        damageDealt: 50,
        monsterHp: 0,
        monsterMaxHp: 50,
        monsterAlive: false,
        killed: true,
      }),
      fromUserId: 'u-host',
    })

    expect(result.state.monsters['m-1']?.snapshot).toMatchObject({ hp: 0, alive: false })
    expect(result.effects).toContainEqual({
      type: 'monster_died',
      monsterId: 'm-1',
      killedByUserId: 'u-peer',
    })
  })
})
