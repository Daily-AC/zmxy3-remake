import { describe, it, expect } from 'vitest'
import { TICK_MS } from '../src/systems/tick'
import { NO_EDGES, advanceHero, initHeroState, makeHeroConfig } from '../src/systems/heroSim'
import { initMonster, advanceMonster, type MonsterConfig } from '../src/systems/monsterSim'
import { resolveHorizontalMotion, resolveVerticalMotion } from '../src/systems/platformSim'
import {
  areStopPointsCleared,
  createContinuousSpawnerState,
  createLevelState,
  createSubStageChainState,
  currentSubStage,
  getActiveWaveRoster,
  isSubStageChainCleared,
  markCurrentSubStageCleared,
  tryAdvanceSubStage,
  updateContinuousSpawner,
  updateLevelSpawn,
} from '../src/systems/level'
import { LEVEL_1_WUYING, LEVEL1_MONSTER_STATS } from '../src/data/levels/level1'

function monsterCfg(species: string): MonsterConfig {
  return {
    stats: LEVEL1_MONSTER_STATS[species],
    patrolMin: 0,
    patrolMax: 4900,
    hurtDurationMs: 100,
    attackDurationMs: 100,
    deadDurationMs: 100,
    attackCooldownMs: 1000,
    decisionIntervalMs: 1000,
    tickMs: TICK_MS,
    rng: () => 1,
  }
}

function clearWaveState(level = createLevelState(currentSubStage(createSubStageChainState(LEVEL_1_WUYING)).waveLevel!)) {
  for (let guard = 0; guard < 100 && !areStopPointsCleared(level); guard++) {
    if (updateLevelSpawn(level, 0)) {
      const roster = getActiveWaveRoster(level)
      updateLevelSpawn(level, roster.length)
      updateLevelSpawn(level, 0)
    }
  }
  return level
}

describe('Level 1 headless smoke (systems only)', () => {
  it('enter L1 -> climb platforms -> height boss -> door -> sl12 -> sl13 -> isLevelCleared', () => {
    const chain = createSubStageChainState(LEVEL_1_WUYING)
    const sl11 = currentSubStage(chain)
    expect(sl11.id).toBe('sl11')

    const heroCfg = makeHeroConfig({
      groundY: sl11.heroStart.y,
      minX: sl11.bounds.left,
      maxX: sl11.bounds.right,
      comboStageDurationsMs: [0, 300, 300, 300, 300, 367],
      comboGraceMs: 220,
    })
    heroCfg.jump.platformResolver = (q) => resolveVerticalMotion(sl11.fallbackWalls, q)
    heroCfg.resolveHorizontal = (q) => resolveHorizontalMotion(sl11.fallbackWalls, q).x
    const hero = initHeroState(heroCfg, sl11.heroStart.x)

    for (const platform of sl11.fallbackWalls.filter((w) => w.type !== 'throughDownButUp').slice(1)) {
      hero.x = platform.x + platform.width / 2
      hero.vertical.grounded = false
      hero.vertical.airAction = 'jump3'
      hero.vertical.jumpCount = 1
      hero.vertical.y = platform.y - 80
      hero.vertical.vy = 18
      for (let i = 0; i < 20 && !hero.vertical.grounded; i++) advanceHero(hero, NO_EDGES, TICK_MS, heroCfg)
      expect(hero.vertical.y).toBe(platform.y)
    }

    const spawner = createContinuousSpawnerState(sl11.continuousSpawner!)
    const top = updateContinuousSpawner(spawner, { x: hero.x, y: -1900, alive: true }, 3000, () => 0.5)
    expect(top.spawns.map((s) => s.species)).toEqual(['monster30', 'monster30'])
    const configuredBoss = sl11.continuousSpawner!.heightTrigger!.boss
    expect(top.bossSpawn).toMatchObject({
      species: configuredBoss.species,
      x: configuredBoss.x,
      y: configuredBoss.y,
    })

    const bossCfg = monsterCfg('monster3')
    const boss = initMonster(bossCfg, top.bossSpawn!.x, top.bossSpawn!.y)
    advanceMonster(
      boss,
      { heroX: hero.x, heroY: hero.vertical.y, heroAlive: true, incomingHit: { attackId: 1, damage: 99999 } },
      TICK_MS,
      bossCfg,
    )
    expect(boss.mode).toBe('dead')
    markCurrentSubStageCleared(chain)
    expect(tryAdvanceSubStage(chain, sl11.door.x + 1, sl11.door.y + 1, true)).toBe(true)

    const sl12 = currentSubStage(chain)
    expect(sl12.id).toBe('sl12')
    expect(areStopPointsCleared(clearWaveState(createLevelState(sl12.waveLevel!)))).toBe(true)
    markCurrentSubStageCleared(chain)
    expect(tryAdvanceSubStage(chain, sl12.door.x + 1, sl12.door.y + 1, true)).toBe(true)

    const sl13 = currentSubStage(chain)
    expect(sl13.id).toBe('sl13')
    expect(areStopPointsCleared(clearWaveState(createLevelState(sl13.waveLevel!)))).toBe(true)
    markCurrentSubStageCleared(chain)
    expect(tryAdvanceSubStage(chain, sl13.door.x + 1, sl13.door.y + 1, true)).toBe(true)

    expect(isSubStageChainCleared(chain)).toBe(true)
  })
})
