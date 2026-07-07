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

  it('tier separation: grunt waves are pure, each elite appears solo, 二郎神 only in the arena, 哮天犬 never a grunt', () => {
    // 朱子真/袁洪 are elite-grade; they must never spawn inside a grunt roster.
    const SUBBOSS = new Set(['monster21', 'monster20'])
    const waves = LEVEL_3_ERLANGSHEN.stopPoints.map((sp) => sp.roster.map((r) => r.species))

    // (1) any wave containing an elite is that elite ALONE
    for (const w of waves) {
      if (w.some((s) => SUBBOSS.has(s))) {
        expect(w).toHaveLength(1)
        expect(SUBBOSS.has(w[0])).toBe(true)
      }
    }
    // (2) every elite gets exactly one solo wave
    for (const sb of SUBBOSS) {
      expect(waves.filter((w) => w.length === 1 && w[0] === sb)).toHaveLength(1)
    }
    // (3) all grunt waves precede all sub-boss waves (小兵波 → sub-boss → boss)
    const hasBoss = waves.map((w) => w.some((s) => SUBBOSS.has(s)))
    expect(hasBoss.indexOf(true)).toBeGreaterThan(hasBoss.lastIndexOf(false))
    // (4) the arena boss 二郎神 never appears in a wave
    expect(waves.flat()).not.toContain(LEVEL_3_ERLANGSHEN.boss.species)
    // (5) 哮天犬 (9999999 hp companion) is NOT wave-spawned as a trash mob
    expect(waves.flat()).not.toContain('monster23')
  })
})
