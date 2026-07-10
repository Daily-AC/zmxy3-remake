import { describe, it, expect } from 'vitest'
import {
  areStopPointsCleared,
  createLevelState,
  createSubStageChainState,
  currentSubStage,
  expandMonsterSpawnRoster,
  getActiveWaveRoster,
  markCurrentSubStageCleared,
  tryAdvanceSubStage,
  updateLevelSpawn,
} from '../src/systems/level'
import { advanceMonster, initMonster, type MonsterConfig } from '../src/systems/monsterSim'
import { TICK_MS } from '../src/systems/tick'
import {
  LEVEL_1_SL12,
  LEVEL_1_SL13,
  LEVEL_1_WUYING,
  LEVEL_2_TIANGONGDAO,
  LEVEL_3_NANTIANMEN,
  LEVEL1_MONSTER_STATS,
} from '../src/data/levels/level1'

function clearAllWaves(def: typeof LEVEL_1_SL12) {
  const state = createLevelState(def)
  for (let guard = 0; guard < 100 && !areStopPointsCleared(state); guard++) {
    if (!updateLevelSpawn(state, 0)) continue
    const roster = getActiveWaveRoster(state)
    expect(roster.length).toBeGreaterThan(0)
    updateLevelSpawn(state, roster.length)
    updateLevelSpawn(state, 0)
  }
  return state
}

function cfgFor(stats: MonsterConfig['stats'], rng: () => number): MonsterConfig {
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

describe('Stage 1 campaign levels recovered from AS3 stage/level coordinates', () => {
  it('models sl11 as the vertical climb with StageListener11 swarm and height-triggered 巫鹰', () => {
    const sl11 = LEVEL_1_WUYING.subStages[0]

    expect(sl11.id).toBe('sl11')
    expect(sl11.mode).toBe('climb')
    expect(sl11.continuousSpawner).toMatchObject({
      initialDelayMs: 3000,
      intervalMs: 6000,
      count: 2,
      offsetX: { min: -150, max: 150 },
      offsetY: { min: -300, max: -100 },
    })
    expect(sl11.continuousSpawner!.roster.map((s) => s.species)).toEqual(['monster30'])
    expect(sl11.continuousSpawner!.heightTrigger!.thresholdY).toBe(-1900)
    expect(sl11.continuousSpawner!.heightTrigger!.boss).toMatchObject({
      species: 'monster3',
      x: 750,
      y: -1872.45,
      label: '巫鹰',
    })
  })

  it('keeps 九重天, 天宫道 and 南天门 as separate levels instead of one fused chain', () => {
    expect(LEVEL_1_WUYING.subStages.map((s) => s.id)).toEqual(['sl11'])
    expect(LEVEL_2_TIANGONGDAO.subStages.map((s) => s.id)).toEqual(['sl12'])
    expect(LEVEL_3_NANTIANMEN.subStages.map((s) => s.id)).toEqual(['sl13'])
    expect(LEVEL_2_TIANGONGDAO.subStages[0].waveLevel).toBe(LEVEL_1_SL12)
    expect(LEVEL_3_NANTIANMEN.subStages[0].waveLevel).toBe(LEVEL_1_SL13)

    expect(areStopPointsCleared(clearAllWaves(LEVEL_1_SL12))).toBe(true)
    expect(areStopPointsCleared(clearAllWaves(LEVEL_1_SL13))).toBe(true)
  })

  it('preserves all five official 天宫道 StopPoints in traversal order', () => {
    expect(LEVEL_1_SL12.stopPoints.map((point) => point.stopX)).toEqual([
      1147.4,
      1809.7,
      2813.95,
      3790.2,
      4661.55,
    ])
  })

  it('preserves all thirteen official 天宫道 MonsterAppearPoints', () => {
    const points = LEVEL_1_SL12.stopPoints.flatMap((point) => point.roster)
    expect(points).toHaveLength(13)
    expect(points.map(({ species, x, delayMs, intervalMs, quantity }) => ({ species, x, delayMs, intervalMs, quantity }))).toEqual([
      { species: 'monster8', x: 347.6, delayMs: 2000, intervalMs: 1000, quantity: 4 },
      { species: 'monster8', x: 967.55, delayMs: 2000, intervalMs: 1000, quantity: 4 },
      { species: 'monster7', x: 1266.7, delayMs: 6000, intervalMs: 1000, quantity: 3 },
      { species: 'monster8', x: 1521.4, delayMs: 2000, intervalMs: 1000, quantity: 5 },
      { species: 'monster7', x: 1783.5, delayMs: 6000, intervalMs: 1000, quantity: 3 },
      { species: 'monster7', x: 1948.8, delayMs: 2000, intervalMs: 1000, quantity: 6 },
      { species: 'monster7', x: 2661.45, delayMs: 2000, intervalMs: 1000, quantity: 6 },
      { species: 'monster7', x: 2945.25, delayMs: 2000, intervalMs: 1000, quantity: 3 },
      { species: 'monster8', x: 2888.95, delayMs: 6000, intervalMs: 1000, quantity: 3 },
      { species: 'monster7', x: 3559.3, delayMs: 2000, intervalMs: 1000, quantity: 4 },
      { species: 'monster8', x: 3635.4, delayMs: 6000, intervalMs: 1000, quantity: 3 },
      { species: 'monster4', x: 4009.8, delayMs: 2000, intervalMs: 1000, quantity: 1 },
      { species: 'monster2', x: 4606.85, delayMs: 2000, intervalMs: 1000, quantity: 1 },
    ])
    const expanded = expandMonsterSpawnRoster(points)
    expect(expanded).toHaveLength(46)
    expect(expanded.slice(0, 4).map(({ x, delayMs }) => ({ x, delayMs }))).toEqual([
      { x: 347.6, delayMs: 2000 },
      { x: 347.6, delayMs: 3000 },
      { x: 347.6, delayMs: 4000 },
      { x: 347.6, delayMs: 5000 },
    ])
  })

  it('gates each 天宫道 wave until its official StopPoint is reached', () => {
    const state = createLevelState(LEVEL_1_SL12)
    expect(updateLevelSpawn(state, 0, 1, 1147.39)).toBe(false)
    expect(updateLevelSpawn(state, 0, 1, 1147.4)).toBe(true)
    expect(getActiveWaveRoster(state).map((point) => point.x)).toEqual([347.6, 967.55])
  })

  it('uses the mined sl12 bounds, transfer door and official extracted image layers', () => {
    const sl12 = LEVEL_2_TIANGONGDAO.subStages[0]
    expect(sl12.name).toBe('天宫道')
    expect(sl12.bounds).toEqual({ left: -195.997, right: 5019.33, top: -138.582, bottom: 540 })
    expect(sl12.door).toEqual({ x: 4520.9, y: 341.65, width: 185.8, height: 165 })
    expect(sl12.background).toEqual({
      base: 'floorBg1',
      foreground: 'bg12',
      floor: 'online_floor12',
      scrollFactorX: 0.112,
    })
    expect(sl12.fallbackWalls[0]).toMatchObject({ x: -180.629, y: 501.05, width: 5199.959, height: 20 })
  })

  it('uses REAL recovered magnitudes — Monster30 is the 1-hp swarm imp, not the placeholder 150', () => {
    const s = LEVEL1_MONSTER_STATS
    expect(s.monster30.hp).toBe(1)
    expect(s.monster30.speed).toBe(8)
    expect(s.monster8.hp).toBe(80)
    expect(s.monster7.hp).toBe(150)
    expect(s.monster4.hp).toBeLessThan(s.monster2.hp) // 千里眼 1500 < 顺风耳 2000
    expect(s.monster2.hp).toBeLessThan(s.monster5.hp) // 顺风耳 2000 < 巨灵神 4000
    expect(s.monster3.hp).toBe(300) // 巫鹰 boss, verbatim
  })

  it('normalAttackRate uses literal species overrides or BaseMonster.as:28 default, never protectedParamsObject.probability', () => {
    const s = LEVEL1_MONSTER_STATS
    expect(s.monster8.normalAttackRate).toBe(0.3)
    expect(s.monster7.normalAttackRate).toBe(0.3)
    expect(s.monster30.normalAttackRate).toBe(0.25)
    expect(s.monster4.normalAttackRate).toBe(0.3)
    expect(s.monster2.normalAttackRate).toBe(0.3)
    expect(s.monster5.normalAttackRate).toBe(0.8)
    expect(s.monster3.normalAttackRate).toBe(0.3)
  })

  it('Monster7 grunt attacks within one decision cycle when rng 0.29 is under the corrected BaseMonster default 0.3', () => {
    const cfg = cfgFor(LEVEL1_MONSTER_STATS.monster7, () => 0.29)
    const m = initMonster(cfg, 500, 400)
    const events = []

    for (let i = 0; i < 32; i++) {
      events.push(...advanceMonster(m, { heroX: 600, heroAlive: true, incomingHit: null }, TICK_MS, cfg))
    }

    expect(m.mode).toBe('attack')
    expect(events.some((e) => e.type === 'attack-start')).toBe(true)
  })

  it('tier separation: 天宫道双将 and 南天门巨灵神 stay outside 九重天', () => {
    const sl12Waves = LEVEL_1_SL12.stopPoints.map((sp) => sp.roster.map((r) => r.species))
    const sl13Waves = LEVEL_1_SL13.stopPoints.map((sp) => sp.roster.map((r) => r.species))

    expect(sl12Waves.at(-1)).toEqual(['monster4', 'monster2'])
    expect(sl13Waves).toContainEqual(['monster5'])
    expect([...sl12Waves.flat(), ...sl13Waves.flat()]).not.toContain('monster3')
    expect(LEVEL_1_WUYING.subStages[0].continuousSpawner!.heightTrigger!.boss.species).toBe('monster3')
  })
})
