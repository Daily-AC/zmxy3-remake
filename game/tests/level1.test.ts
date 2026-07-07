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
import { LEVEL_1_WUYING, LEVEL1_MONSTER_STATS } from '../src/data/levels/level1'

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

function killAndRemove(m: MonsterState, cfg: MonsterConfig) {
  advanceMonster(m, { heroX: HERO_X, heroAlive: true, incomingHit: lethal(cfg.stats.hp) }, TICK_MS, cfg)
  for (let i = 0; i < 60 && m.mode !== 'gone'; i++) {
    advanceMonster(m, { heroX: HERO_X, heroAlive: true, incomingHit: null }, TICK_MS, cfg)
  }
}

describe('Level 1 巫鹰关 — real 1.swf wave/boss port', () => {
  it('clears every stop point by really spawning and killing each wave, then advances to the boss', () => {
    const state = createLevelState(LEVEL_1_WUYING)
    let spawnedWaves = 0

    for (let guard = 0; guard < 100 && !isBossZoneTriggered(state); guard++) {
      if (updateLevelSpawn(state, 0)) {
        spawnedWaves++
        const roster = getActiveWaveRoster(state)
        expect(roster.length).toBeGreaterThan(0)
        const mobs = roster.map((r) => initMonster(cfgFor(r.stats), HERO_X + 200, 400))
        expect(updateLevelSpawn(state, mobs.length)).toBe(false)
        mobs.forEach((m, i) => killAndRemove(m, cfgFor(roster[i].stats)))
        updateLevelSpawn(state, 0)
      }
    }

    expect(spawnedWaves).toBe(LEVEL_1_WUYING.stopPoints.length)
    expect(state.stopPoints.every((sp) => sp.cleared)).toBe(true)
    expect(isBossZoneTriggered(state)).toBe(true)
  })

  it('spawns 巫鹰 (300 hp), kills it, opens the door, clears the level', () => {
    const state = createLevelState(LEVEL_1_WUYING)
    for (let guard = 0; guard < 100 && !isBossZoneTriggered(state); guard++) {
      if (updateLevelSpawn(state, 0)) {
        updateLevelSpawn(state, 2)
        updateLevelSpawn(state, 0)
      }
    }
    markBossTriggered(state)

    const bossCfg = cfgFor(LEVEL_1_WUYING.boss.stats)
    const boss = activateBossArena(state, bossCfg, HERO_X, 300)
    expect(boss.hp).toBe(300) // 巫鹰, 5*60 recovered from Monster3
    expect(LEVEL_1_WUYING.boss.label).toBe('巫鹰')

    killAndRemove(boss, bossCfg)
    expect(isBossDead(boss)).toBe(true)

    revealTransferDoor(state)
    const door = LEVEL_1_WUYING.door
    expect(tryClearArena(state, door.x + 10, door.y + 10, true)).toBe(true)
    expect(isLevelCleared(state)).toBe(true)
  })

  it('uses REAL recovered magnitudes — Monster30 is the 1-hp swarm imp, not the placeholder 150', () => {
    const s = LEVEL1_MONSTER_STATS
    expect(s.monster30.hp).toBe(1) // real; the old invented LEVEL_1 used 150
    expect(s.monster30.speed).toBe(8) // fast/fragile
    expect(s.monster8.hp).toBe(80)
    expect(s.monster7.hp).toBe(150)
    // mini-boss escalation is monotonic by hp
    expect(s.monster4.hp).toBeLessThan(s.monster2.hp) // 千里眼 1500 < 顺风耳 2000
    expect(s.monster2.hp).toBeLessThan(s.monster5.hp) // 顺风耳 2000 < 巨灵神 4000
    expect(s.monster3.hp).toBe(300) // 巫鹰 boss, verbatim
  })

  it('the arena boss is not in a grunt wave, but the three mini-bosses are', () => {
    const waveSpecies = new Set(
      LEVEL_1_WUYING.stopPoints.flatMap((sp) => sp.roster).map((r) => r.species),
    )
    expect(waveSpecies.has(LEVEL_1_WUYING.boss.species)).toBe(false) // 巫鹰 only in arena
    expect(waveSpecies.has('monster4')).toBe(true) // 千里眼
    expect(waveSpecies.has('monster2')).toBe(true) // 顺风耳
    expect(waveSpecies.has('monster5')).toBe(true) // 巨灵神
  })
})
