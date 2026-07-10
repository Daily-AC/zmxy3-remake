import { describe, it, expect } from 'vitest'
import {
  areStopPointsCleared,
  createLevelState,
  createSubStageChainState,
  currentSubStage,
  getActiveWaveRoster,
  markCurrentSubStageCleared,
  tryAdvanceSubStage,
  updateLevelSpawn,
} from '../src/systems/level'
import { advanceMonster, initMonster, type MonsterConfig } from '../src/systems/monsterSim'
import { TICK_MS } from '../src/systems/tick'
import { LEVEL_1_SL12, LEVEL_1_SL13, LEVEL_1_WUYING, LEVEL1_MONSTER_STATS } from '../src/data/levels/level1'

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

describe('Level 1 九重天 — AS3 three-substage structure', () => {
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

  it('models sl12 and sl13 as horizontal combat substages backed by existing WaveSpec stop-point runtime', () => {
    expect(LEVEL_1_WUYING.subStages.map((s) => s.id)).toEqual(['sl11', 'sl12', 'sl13'])
    expect(LEVEL_1_WUYING.subStages[1].waveLevel).toBe(LEVEL_1_SL12)
    expect(LEVEL_1_WUYING.subStages[2].waveLevel).toBe(LEVEL_1_SL13)

    expect(areStopPointsCleared(clearAllWaves(LEVEL_1_SL12))).toBe(true)
    expect(areStopPointsCleared(clearAllWaves(LEVEL_1_SL13))).toBe(true)
  })

  it('substage chain advances by transferDoor from sl11 to sl12 to sl13', () => {
    const chain = createSubStageChainState(LEVEL_1_WUYING)

    expect(currentSubStage(chain).id).toBe('sl11')
    markCurrentSubStageCleared(chain)
    expect(tryAdvanceSubStage(chain, 1010, -2050, true)).toBe(true)
    expect(currentSubStage(chain).id).toBe('sl12')

    markCurrentSubStageCleared(chain)
    expect(tryAdvanceSubStage(chain, 4710, 400, true)).toBe(true)
    expect(currentSubStage(chain).id).toBe('sl13')
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

  it('tier separation: mini-bosses live in sl12/sl13 waves, 巫鹰 only in sl11 height trigger', () => {
    const sl12Waves = LEVEL_1_SL12.stopPoints.map((sp) => sp.roster.map((r) => r.species))
    const sl13Waves = LEVEL_1_SL13.stopPoints.map((sp) => sp.roster.map((r) => r.species))

    expect(sl12Waves).toContainEqual(['monster4'])
    expect(sl12Waves).toContainEqual(['monster2'])
    expect(sl13Waves).toContainEqual(['monster5'])
    expect([...sl12Waves.flat(), ...sl13Waves.flat()]).not.toContain('monster3')
    expect(LEVEL_1_WUYING.subStages[0].continuousSpawner!.heightTrigger!.boss.species).toBe('monster3')
  })
})
