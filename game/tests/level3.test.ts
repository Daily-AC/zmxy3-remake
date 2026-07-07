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
import { LEVEL_3_ERLANGSHEN, LEVEL3_MONSTER_STATS } from '../src/data/levels/level3'

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

describe('Level 3 二郎神关 — real 3.swf wave/boss port', () => {
  it('clears every stop point by really spawning and killing each wave, then advances', () => {
    const state = createLevelState(LEVEL_3_ERLANGSHEN)
    let spawnedWaves = 0

    // Play the whole grunt phase: spawn each wave's real roster as monsterSim
    // instances, feed the true alive-count back into the stop-point machine,
    // then kill them and confirm the stop point clears.
    for (let guard = 0; guard < 100 && !isBossZoneTriggered(state); guard++) {
      const spawnedNow = updateLevelSpawn(state, 0)
      if (spawnedNow) {
        spawnedWaves++
        const roster = getActiveWaveRoster(state)
        expect(roster.length).toBeGreaterThan(0)
        const mobs = roster.map((r) => initMonster(cfgFor(r.stats), HERO_X + 200, 400))

        // One tick with the wave alive so the machine marks it "seen active".
        expect(updateLevelSpawn(state, mobs.length)).toBe(false)

        // Kill them all, then report 0 alive -> stop point should clear.
        mobs.forEach((m, i) => killAndRemove(m, cfgFor(roster[i].stats)))
        updateLevelSpawn(state, 0)
      }
    }

    expect(spawnedWaves).toBe(LEVEL_3_ERLANGSHEN.stopPoints.length)
    expect(state.stopPoints.every((sp) => sp.cleared)).toBe(true)
    expect(isBossZoneTriggered(state)).toBe(true)
  })

  it('spawns 二郎神 with the recovered 45137 hp, kills it, opens the door, and clears the level', () => {
    const state = createLevelState(LEVEL_3_ERLANGSHEN)

    // fast-forward the grunt phase
    for (let guard = 0; guard < 100 && !isBossZoneTriggered(state); guard++) {
      if (updateLevelSpawn(state, 0)) {
        updateLevelSpawn(state, 2) // seen alive
        updateLevelSpawn(state, 0) // cleared
      }
    }
    expect(isBossZoneTriggered(state)).toBe(true)
    markBossTriggered(state)

    const bossCfg = cfgFor(LEVEL_3_ERLANGSHEN.boss.stats)
    const boss = activateBossArena(state, bossCfg, HERO_X, 300)
    expect(boss.hp).toBe(45137) // 二郎神, recovered verbatim from Monster22
    expect(state.arena.state).toBe('active')

    killAndRemove(boss, bossCfg)
    expect(isBossDead(boss)).toBe(true)

    revealTransferDoor(state)
    const door = LEVEL_3_ERLANGSHEN.door
    // must be inside the door and press interact
    expect(tryClearArena(state, 0, 0, true)).toBe(false)
    expect(tryClearArena(state, door.x + 10, door.y + 10, true)).toBe(true)
    expect(isLevelCleared(state)).toBe(true)
  })

  it('is a real internal difficulty escalation (grunt < 朱子真/袁洪 < 二郎神), all real magnitudes', () => {
    const s = LEVEL3_MONSTER_STATS
    // grunts are the recovered single-branch values
    expect(s.monster11.hp).toBe(5100)
    expect(s.monster12.hp).toBe(6500)
    expect(s.monster13.hp).toBe(5000)
    expect(s.monster14.hp).toBe(8000)
    expect(s.monster1.hp).toBe(5200)
    // elites escalate below the arena boss
    expect(s.monster21.hp).toBeLessThan(s.monster22.hp)
    expect(s.monster20.hp).toBeLessThan(s.monster22.hp)
    expect(s.monster21.hp).toBe(20000)
    expect(s.monster20.hp).toBe(30000)
    expect(s.monster22.hp).toBe(45137)
    // every elite/boss out-tanks every basic grunt
    const grunts = [s.monster1, s.monster11, s.monster12, s.monster13, s.monster14]
    const heavies = [s.monster21, s.monster20, s.monster22]
    for (const grunt of grunts) {
      for (const heavy of heavies) {
        expect(heavy.hp).toBeGreaterThan(grunt.hp)
        expect(heavy.def).toBeGreaterThan(grunt.def)
      }
    }
    // level 3's boss dwarfs level 2's (multi-level escalation sanity check)
    expect(s.monster22.hp).toBeGreaterThan(16000)
  })

  it('the boss appears in the arena, not in a grunt wave', () => {
    const gruntSpecies = new Set(
      LEVEL_3_ERLANGSHEN.stopPoints.flatMap((sp) => sp.roster).map((r) => r.species),
    )
    expect(gruntSpecies.has(LEVEL_3_ERLANGSHEN.boss.species)).toBe(false)
    // ...but the two named elites DO appear inside grunt waves
    expect(gruntSpecies.has('monster21' as any)).toBe(true)
    expect(gruntSpecies.has('monster20' as any)).toBe(true)
    // the companion (哮天犬) is folded into the final wave, not the arena
    expect(gruntSpecies.has('monster23' as any)).toBe(true)
  })
})
