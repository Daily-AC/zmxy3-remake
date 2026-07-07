import { describe, it, expect } from 'vitest'
import {
  LEVEL_1,
  LEVEL_2,
  LEVELS,
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
  createLevelProgression,
  advanceToNextLevel,
  isCampaignComplete,
  scaleMonsterStats,
  MONSTER_SPECIES_STATS,
} from '../src/systems/level'
import { advanceMonster, MonsterConfig } from '../src/systems/monsterSim'
import { TICK_MS } from '../src/systems/tick'

function makeBossConfig(rng: () => number = () => 1): MonsterConfig {
  return {
    stats: MONSTER_SPECIES_STATS.monster3, // overridden by activateBossArena anyway
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

describe('level (停点刷怪/BOSS触发/传送门通关/多关难度墙)', () => {
  it('spawns the first wave immediately, then gates on it being seen alive and cleared', () => {
    const state = createLevelState(LEVEL_1)

    // First call: no monsters spawned yet -> should spawn wave 0.
    expect(updateLevelSpawn(state, 0)).toBe(true)
    expect(state.activeStopIndex).toBe(0)
    expect(getActiveWaveRoster(state)).toBe(LEVEL_1.stopPoints[0].roster)
    expect(state.stopPoints[0].waveSpawned).toBe(true)
    expect(state.stopPoints[0].cleared).toBe(false)

    // Wave alive: no re-spawn, marks "was seen active".
    expect(updateLevelSpawn(state, 2)).toBe(false)
    expect(state.stopPoints[0].waveHadActiveMonsters).toBe(true)
    expect(state.stopPoints[0].cleared).toBe(false)

    // Wave count drops to 0 (all dead) -> stop point clears, moves off this index.
    expect(updateLevelSpawn(state, 0)).toBe(false)
    expect(state.stopPoints[0].cleared).toBe(true)

    // Next call advances to stop point 1 and spawns its wave.
    expect(updateLevelSpawn(state, 0)).toBe(true)
    expect(state.activeStopIndex).toBe(1)
  })

  it('does not clear a stop point that spawned but was never observed alive (spawn tick itself has 0 active yet)', () => {
    const state = createLevelState(LEVEL_1)
    updateLevelSpawn(state, 0) // spawns wave 0, waveHadActiveMonsters still false
    // Immediately reporting 0 active (e.g. scene hasn't instantiated yet) must NOT clear it.
    expect(updateLevelSpawn(state, 0)).toBe(false)
    expect(state.stopPoints[0].cleared).toBe(false)
  })

  it('does not spawn further waves once alivePlayerCount is 0', () => {
    const state = createLevelState(LEVEL_1)
    expect(updateLevelSpawn(state, 0, 0)).toBe(false)
    expect(state.stopPoints[0].waveSpawned).toBe(false)
  })

  it('triggers the boss only once every stop point is cleared', () => {
    const state = createLevelState(LEVEL_1)
    expect(isBossZoneTriggered(state)).toBe(false)

    for (let i = 0; i < state.stopPoints.length; i++) {
      updateLevelSpawn(state, 0) // spawn wave i
      updateLevelSpawn(state, 3) // seen alive
      expect(isBossZoneTriggered(state)).toBe(false)
      updateLevelSpawn(state, 0) // cleared
    }

    expect(isBossZoneTriggered(state)).toBe(true)
    markBossTriggered(state)
    expect(state.bossTriggered).toBe(true)
    expect(isBossZoneTriggered(state)).toBe(false) // already triggered, no double-fire
    expect(updateLevelSpawn(state, 0)).toBe(false) // no more grunt waves once boss phase starts
  })

  it('activateBossArena spawns the boss with this level\'s boss stats, regardless of the passed-in config stats', () => {
    const state = createLevelState(LEVEL_1)
    const boss = activateBossArena(state, makeBossConfig(), 700, 300)
    expect(state.arena.state).toBe('active')
    expect(state.arena.boss).toBe(boss)
    expect(boss.hp).toBe(LEVEL_1.boss.stats.hp)
    expect(isBossDead(boss)).toBe(false)
  })

  it('isBossDead follows the monster through hurt/dead/gone', () => {
    const state = createLevelState(LEVEL_1)
    const boss = activateBossArena(state, makeBossConfig(), 700, 300)
    const cfg = { ...makeBossConfig(), stats: LEVEL_1.boss.stats }
    advanceMonster(boss, { heroX: 700, heroAlive: true, incomingHit: { attackId: 1, damage: LEVEL_1.boss.stats.hp + 999 } }, TICK_MS, cfg)
    expect(boss.hp).toBe(0)
    expect(isBossDead(boss)).toBe(true) // 'dead' already counts
    for (let i = 0; i < 30; i++) advanceMonster(boss, { heroX: 700, heroAlive: true, incomingHit: null }, TICK_MS, cfg)
    expect(boss.mode).toBe('gone')
    expect(isBossDead(boss)).toBe(true)
  })

  it('the transfer door only clears the arena when visible, in-bounds, and interact is pressed', () => {
    const state = createLevelState(LEVEL_1)
    activateBossArena(state, makeBossConfig(), 700, 300)
    const door = LEVEL_1.door

    // Door not revealed yet -> no clear even standing in it with interact pressed.
    expect(tryClearArena(state, door.x + 10, door.y + 10, true)).toBe(false)
    expect(state.arena.state).toBe('active')

    revealTransferDoor(state)

    // Outside the door bounds -> no clear.
    expect(tryClearArena(state, 0, 0, true)).toBe(false)
    // Inside bounds but no interact press -> no clear.
    expect(tryClearArena(state, door.x + 10, door.y + 10, false)).toBe(false)
    expect(state.arena.state).toBe('active')

    // Inside bounds + interact -> clears.
    expect(tryClearArena(state, door.x + 10, door.y + 10, true)).toBe(true)
    expect(state.arena.state).toBe('cleared')
    expect(isLevelCleared(state)).toBe(true)
  })

  it('advances a LevelProgression to the next level only once the current one is cleared', () => {
    const progression = createLevelProgression(LEVELS)
    expect(progression.currentState.def.id).toBe('level-1')
    expect(advanceToNextLevel(progression)).toBeNull() // level 1 not cleared yet
    expect(isCampaignComplete(progression)).toBe(false)

    activateBossArena(progression.currentState, makeBossConfig(), 700, 300)
    revealTransferDoor(progression.currentState)
    tryClearArena(progression.currentState, LEVEL_1.door.x + 10, LEVEL_1.door.y + 10, true)
    expect(isLevelCleared(progression.currentState)).toBe(true)

    const next = advanceToNextLevel(progression)
    expect(next).not.toBeNull()
    expect(progression.currentState.def.id).toBe('level-2')
    expect(progression.currentIndex).toBe(1)
    expect(isCampaignComplete(progression)).toBe(false)

    // Clear level 2 too -> campaign complete, no further advance.
    activateBossArena(progression.currentState, makeBossConfig(), 700, 300)
    revealTransferDoor(progression.currentState)
    tryClearArena(progression.currentState, LEVEL_2.door.x + 10, LEVEL_2.door.y + 10, true)
    expect(isCampaignComplete(progression)).toBe(true)
    expect(advanceToNextLevel(progression)).toBeNull()
  })

  it('LEVEL_2 is a real difficulty wall over LEVEL_1: harder boss and harder repeated grunts', () => {
    expect(LEVEL_2.boss.stats.hp).toBeGreaterThan(LEVEL_1.boss.stats.hp)
    expect(LEVEL_2.boss.stats.def).toBeGreaterThan(LEVEL_1.boss.stats.def)

    const level1Monster30 = LEVEL_1.stopPoints
      .flatMap((sp) => sp.roster)
      .find((m) => m.species === 'monster30')!
    const level2Monster30 = LEVEL_2.stopPoints
      .flatMap((sp) => sp.roster)
      .find((m) => m.species === 'monster30')!
    expect(level2Monster30.stats.hp).toBeGreaterThan(level1Monster30.stats.hp)

    // Level 2 introduces a species not used at all in level 1.
    const level1Species = new Set(LEVEL_1.stopPoints.flatMap((sp) => sp.roster).map((m) => m.species))
    const level2Species = new Set(LEVEL_2.stopPoints.flatMap((sp) => sp.roster).map((m) => m.species))
    expect(level1Species.has('monster5')).toBe(false)
    expect(level2Species.has('monster5')).toBe(true)
  })

  it('scaleMonsterStats multiplies hp and adds flat def without mutating the base', () => {
    const base = MONSTER_SPECIES_STATS.monster30
    const scaled = scaleMonsterStats(base, 2, 5)
    expect(scaled.hp).toBe(base.hp * 2)
    expect(scaled.def).toBe(base.def + 5)
    expect(base.hp).toBe(150) // untouched
  })
})
