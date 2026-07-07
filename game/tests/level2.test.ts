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
import { LEVEL_2_TIANWANG, LEVEL2_MONSTER_STATS } from '../src/data/levels/level2'

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

describe('Level 2 天王关 — real 2.swf wave/boss port', () => {
  it('clears every stop point by really spawning and killing each wave, then advances', () => {
    const state = createLevelState(LEVEL_2_TIANWANG)
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

    expect(spawnedWaves).toBe(LEVEL_2_TIANWANG.stopPoints.length)
    expect(state.stopPoints.every((sp) => sp.cleared)).toBe(true)
    expect(isBossZoneTriggered(state)).toBe(true)
  })

  it('spawns 多闻天王 with the recovered 16000 hp, kills it, opens the door, and clears the level', () => {
    const state = createLevelState(LEVEL_2_TIANWANG)

    // fast-forward the grunt phase
    for (let guard = 0; guard < 100 && !isBossZoneTriggered(state); guard++) {
      if (updateLevelSpawn(state, 0)) {
        updateLevelSpawn(state, 2) // seen alive
        updateLevelSpawn(state, 0) // cleared
      }
    }
    expect(isBossZoneTriggered(state)).toBe(true)
    markBossTriggered(state)

    const bossCfg = cfgFor(LEVEL_2_TIANWANG.boss.stats)
    const boss = activateBossArena(state, bossCfg, HERO_X, 300)
    expect(boss.hp).toBe(16000) // 多闻天王, recovered verbatim from Monster15
    expect(state.arena.state).toBe('active')

    killAndRemove(boss, bossCfg)
    expect(isBossDead(boss)).toBe(true)

    revealTransferDoor(state)
    const door = LEVEL_2_TIANWANG.door
    // must be inside the door and press interact
    expect(tryClearArena(state, 0, 0, true)).toBe(false)
    expect(tryClearArena(state, door.x + 10, door.y + 10, true)).toBe(true)
    expect(isLevelCleared(state)).toBe(true)
  })

  it('is a real internal difficulty escalation (grunt < 增长 < 广目 < 多闻), all real magnitudes', () => {
    const s = LEVEL2_MONSTER_STATS
    // grunts are the recovered else-branch values, not the stage-9 elite form
    expect(s.monster9.hp).toBe(1500)
    expect(s.monster10.hp).toBe(1800)
    expect(s.monster19.hp).toBe(1200)
    // Heavenly Kings escalate monotonically
    expect(s.monster6.hp).toBeLessThan(s.monster16.hp)
    expect(s.monster16.hp).toBeLessThan(s.monster15.hp)
    expect(s.monster6.hp).toBe(7874)
    expect(s.monster16.hp).toBe(12000)
    expect(s.monster15.hp).toBe(16000)
    // every king out-tanks every grunt
    for (const grunt of [s.monster9, s.monster10, s.monster19]) {
      for (const king of [s.monster6, s.monster16, s.monster15]) {
        expect(king.hp).toBeGreaterThan(grunt.hp)
        expect(king.def).toBeGreaterThan(grunt.def)
      }
    }
  })

  it('tier separation: grunt waves are pure, each Heavenly King appears solo, 多闻天王 only in the arena', () => {
    // 增长/广目 are boss-grade — they must never spawn inside a grunt roster.
    const SUBBOSS = new Set(['monster6', 'monster16'])
    const waves = LEVEL_2_TIANWANG.stopPoints.map((sp) => sp.roster.map((r) => r.species))

    // (1) any wave containing a King is that King ALONE
    for (const w of waves) {
      if (w.some((s) => SUBBOSS.has(s))) {
        expect(w).toHaveLength(1)
        expect(SUBBOSS.has(w[0])).toBe(true)
      }
    }
    // (2) every King gets exactly one solo wave
    for (const sb of SUBBOSS) {
      expect(waves.filter((w) => w.length === 1 && w[0] === sb)).toHaveLength(1)
    }
    // (3) all grunt waves precede all sub-boss waves (小兵波 → sub-boss → boss)
    const hasBoss = waves.map((w) => w.some((s) => SUBBOSS.has(s)))
    expect(hasBoss.indexOf(true)).toBeGreaterThan(hasBoss.lastIndexOf(false))
    // (4) the arena boss 多闻天王 never appears in a wave
    expect(waves.flat()).not.toContain(LEVEL_2_TIANWANG.boss.species)
  })
})
