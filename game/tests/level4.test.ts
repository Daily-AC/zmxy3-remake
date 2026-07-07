import { describe, it, expect } from 'vitest'
import {
  createLevelState,
  updateLevelSpawn,
  getActiveWaveRoster,
  isBossZoneTriggered,
  markBossTriggered,
  activateBossArena,
  isBossDead,
  revealTransferDoor,
  tryClearArena,
  isLevelCleared,
} from '../src/systems/level'
import { advanceMonster, initMonster, MonsterConfig, MonsterState } from '../src/systems/monsterSim'
import { TICK_MS } from '../src/systems/tick'
import { LEVEL_4_XIENIAN, LEVEL4_MONSTER_STATS } from '../src/data/levels/level4'

function cfgFor(stats: MonsterConfig['stats'], rng: () => number = () => 1): MonsterConfig {
  return {
    stats,
    patrolMin: 90,
    patrolMax: 1460,
    hurtDurationMs: 500,
    attackDurationMs: 333,
    deadDurationMs: 466,
    attackCooldownMs: 1000,
    decisionIntervalMs: 1000,
    tickMs: TICK_MS,
    rng,
  }
}

const HERO_X = 700
function lethal(hp: number) {
  return { attackId: 1, damage: hp + 9999 }
}

// Drives a single spawned monster from alive -> 'gone' by landing a lethal
// hit and ticking through its death animation.
function killAndRemove(m: MonsterState, cfg: MonsterConfig) {
  advanceMonster(m, { heroX: HERO_X, heroAlive: true, incomingHit: lethal(cfg.stats.hp) }, TICK_MS, cfg)
  for (let i = 0; i < 60 && m.mode !== 'gone'; i++) {
    advanceMonster(m, { heroX: HERO_X, heroAlive: true, incomingHit: null }, TICK_MS, cfg)
  }
}

describe('Level 4 邪念之境 — real 4.swf sequential boss-chain port', () => {
  it('clears every stop point (32 -> 33 -> 31) by really spawning and killing each single-monster wave, then advances', () => {
    const state = createLevelState(LEVEL_4_XIENIAN)
    let spawnedWaves = 0
    const spawnedSpeciesOrder: string[] = []

    for (let guard = 0; guard < 100 && !isBossZoneTriggered(state); guard++) {
      const spawnedNow = updateLevelSpawn(state, 0)
      if (spawnedNow) {
        spawnedWaves++
        const roster = getActiveWaveRoster(state)
        expect(roster.length).toBe(1) // every stop point in level 4 is a single boss-tier monster
        spawnedSpeciesOrder.push(roster[0].species)
        const mobs = roster.map((r) => initMonster(cfgFor(r.stats), HERO_X + 200, 400))

        // One tick with the wave alive so the machine marks it "seen active".
        expect(updateLevelSpawn(state, mobs.length)).toBe(false)

        // Kill it, then report 0 alive -> stop point should clear.
        mobs.forEach((m, i) => killAndRemove(m, cfgFor(roster[i].stats)))
        updateLevelSpawn(state, 0)
      }
    }

    expect(spawnedWaves).toBe(LEVEL_4_XIENIAN.stopPoints.length)
    expect(spawnedSpeciesOrder).toEqual(['monster32', 'monster33', 'monster31']) // real destroy()-chain order
    expect(state.stopPoints.every((sp) => sp.cleared)).toBe(true)
    expect(isBossZoneTriggered(state)).toBe(true)
  })

  it('spawns 邪.悟空 (Monster34) with the recovered 54423 hp, kills it, opens the door, and clears the level', () => {
    const state = createLevelState(LEVEL_4_XIENIAN)

    // fast-forward the boss-chain phase
    for (let guard = 0; guard < 100 && !isBossZoneTriggered(state); guard++) {
      if (updateLevelSpawn(state, 0)) {
        updateLevelSpawn(state, 1) // seen alive (single-monster waves)
        updateLevelSpawn(state, 0) // cleared
      }
    }
    expect(isBossZoneTriggered(state)).toBe(true)
    markBossTriggered(state)

    const bossCfg = cfgFor(LEVEL_4_XIENIAN.boss.stats)
    const boss = activateBossArena(state, bossCfg, HERO_X, 300)
    expect(boss.hp).toBe(54423) // 邪.悟空, recovered verbatim from Monster34
    expect(state.arena.state).toBe('active')

    killAndRemove(boss, bossCfg)
    expect(isBossDead(boss)).toBe(true)

    revealTransferDoor(state)
    const door = LEVEL_4_XIENIAN.door
    // must be inside the door and press interact
    expect(tryClearArena(state, 0, 0, true)).toBe(false)
    expect(tryClearArena(state, door.x + 10, door.y + 10, true)).toBe(true)
    expect(isLevelCleared(state)).toBe(true)
  })

  it('is a real internal escalation vs level 2 and a real (non-monotonic-by-hp) chain, all real magnitudes', () => {
    const s = LEVEL4_MONSTER_STATS
    // recovered verbatim values
    expect(s.monster32.hp).toBe(42351)
    expect(s.monster33.hp).toBe(67612)
    expect(s.monster31.hp).toBe(37563)
    expect(s.monster34.hp).toBe(54423)
    // every level-4 unit out-tanks level 2's final boss (多闻天王, 16000 hp) —
    // confirms level 4 is a genuine difficulty step up, not a reused tier.
    for (const m of [s.monster31, s.monster32, s.monster33, s.monster34]) {
      expect(m.hp).toBeGreaterThan(16000)
      expect(m.def).toBeGreaterThan(24)
    }
    // the chain is NOT hp-monotonic: 八戒 (Monster33) has more raw hp than the
    // true final boss 悟空 (Monster34). This is real, recovered from AS3, not
    // a data-entry mistake — asserted so a future "fix" doesn't sort it.
    expect(s.monster33.hp).toBeGreaterThan(s.monster34.hp)
    // all four share the literal normalAttackRate=0.8 recovered from each
    // constructor (not a probability-field stand-in).
    for (const m of [s.monster31, s.monster32, s.monster33, s.monster34]) {
      expect(m.normalAttackRate).toBe(0.8)
    }
  })

  it('tier separation: every stop point is a single corrupted disciple, 邪.悟空 only in the arena', () => {
    // Level 4 has no grunts — all four are boss-grade; each of the first three
    // appears solo in order, and 邪.悟空 is the arena boss.
    const SUBBOSS = new Set(['monster32', 'monster33', 'monster31'])
    const waves = LEVEL_4_XIENIAN.stopPoints.map((sp) => sp.roster.map((r) => r.species))

    // (1) each wave is exactly one boss-tier disciple (never a mixed roster)
    for (const w of waves) {
      expect(w).toHaveLength(1)
      expect(SUBBOSS.has(w[0])).toBe(true)
    }
    // (2) each disciple gets exactly one solo wave
    for (const sb of SUBBOSS) {
      expect(waves.filter((w) => w.length === 1 && w[0] === sb)).toHaveLength(1)
    }
    // (3) the arena boss 邪.悟空 never appears in a wave
    expect(waves.flat()).not.toContain(LEVEL_4_XIENIAN.boss.species)
  })
})
