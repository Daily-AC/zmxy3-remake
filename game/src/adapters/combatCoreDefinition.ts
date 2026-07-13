import { defineContentId } from '@zaixu/content'
import { MONSTER_ATTACKS } from '@zaixu/game-core/monsterAttackSpecs'
import {
  validateCombatSessionDefinition,
  type CombatSessionDefinition,
  type HeroCombatDefinition,
} from '@zaixu/game-core'
import monster7Raw from '../data/monsters/monster7.json'
import role1Raw from '../data/roles/role1.json'
import { LEVEL1_MONSTER_STATS } from '../data/levels/level1'
import { monsterAttackPower } from '../data/monsterAttackPower'
import { monsterBaselineCorrectionY } from '../presentation/actorVisualMetrics'
import { TICK_MS } from '../systems/tick'
import { actionDurationMs, type RoleData } from '../systems/roleData'

const HERO_SCALE = 1.5
const HERO_CONTENT_ID = defineContentId('character.zaixu.wukong')
const MONSTER7_CONTENT_ID = defineContentId('monster.chapter1.monster7')
const GROUND_Y = 400
const HERO_START_X = 480
const MONSTER_START_X = 900
const MIN_X = 90
const MAX_X = 1460
const COMBO_GRACE_MS = 1500
const HERO_HURTBOX = { width: 90, height: 150 }
const MONSTER7_HURTBOX = { width: 90, height: 105 }
const HERO_NORMAL_ATTACK_BOX = {
  forward: 85,
  y: 0,
  width: 130,
  height: 150,
}

const role1Data = role1Raw as RoleData
const monster7Data = monster7Raw as RoleData

export interface CombatCoreSliceOverrides {
  monsterX?: number
  monsterHp?: number
  monsterAttackRate?: number
}

function heroNormalAttacks(): HeroCombatDefinition['normalAttacks'] {
  return Object.fromEntries(
    (['hit1', 'hit2', 'hit3', 'hit4', 'hit5'] as const).map((action) => [
      action,
      {
        action,
        hitFrameFractions: [0],
        hitbox: { ...HERO_NORMAL_ATTACK_BOX },
      },
    ]),
  ) as unknown as HeroCombatDefinition['normalAttacks']
}

export function buildCombatCoreSliceDefinition(
  overrides: CombatCoreSliceOverrides = {},
): CombatSessionDefinition {
  const sourceStats = LEVEL1_MONSTER_STATS.monster7
  const monsterStats = {
    ...sourceStats,
    hp: overrides.monsterHp ?? sourceStats.hp,
    normalAttackRate: overrides.monsterAttackRate ?? sourceStats.normalAttackRate,
  }
  const attackPower = monsterAttackPower('monster7', monsterStats)
  const definition: CombatSessionDefinition = {
    version: 1,
    contentVersion: 'combat-core-slice@1',
    tickRate: 30,
    seed: 0x5a17,
    provenance: [
      { ruleId: 'simulation.tick-rate', origin: 'canonical', source: 'game/src/systems/tick.ts' },
      { ruleId: 'role1.combo-duration', origin: 'canonical', source: 'game/src/data/roles/role1.json' },
      { ruleId: 'monster7.stats', origin: 'canonical', source: 'game/src/data/levels/level1.ts' },
      { ruleId: 'monster7.hit1-power', origin: 'canonical', source: 'game/src/data/monsterAttackPower.ts' },
      { ruleId: 'physics-defense', origin: 'canonical', source: 'packages/game-core/src/combat/heroScale.ts' },
      { ruleId: 'legacy.rng-consumption', origin: 'canonical', source: 'game/src/scenes/BattleScene.ts#resolveHeroHits' },
      { ruleId: 'combat.hitbox', origin: 'adapted', source: 'explicit AABB slice contract' },
      { ruleId: 'role1.normal-active-frame', origin: 'adapted', source: 'current BattleScene swing-live rule' },
      { ruleId: 'showcase.profile', origin: 'invented', source: 'Combat Core Slice acceptance profile' },
    ],
    hero: {
      id: 'hero-1',
      contentId: HERO_CONTENT_ID,
      spawn: { x: HERO_START_X, y: GROUND_Y },
      collisionOffset: {
        x: role1Data.offset.x * HERO_SCALE,
        y: role1Data.offset.y * HERO_SCALE,
      },
      groundY: GROUND_Y,
      minX: MIN_X,
      maxX: MAX_X,
      maxHp: 120,
      atk: 36,
      def: 2,
      magicDefenseFraction: 0,
      critChance: 0,
      comboStageDurationsMs: (['hit1', 'hit2', 'hit3', 'hit4', 'hit5'] as const)
        .map((action) => actionDurationMs(role1Data.actions[action], TICK_MS)),
      comboGraceMs: COMBO_GRACE_MS,
      normalAttacks: heroNormalAttacks(),
      hurtbox: { ...HERO_HURTBOX },
      hurtDurationMs: 260,
      respawnDelayMs: 1500,
    },
    monsters: [{
      id: 'monster-1',
      contentId: MONSTER7_CONTENT_ID,
      spawn: { x: overrides.monsterX ?? MONSTER_START_X, y: GROUND_Y },
      collisionOffset: {
        x: monster7Data.offset.x * HERO_SCALE,
        y: monster7Data.offset.y * HERO_SCALE + monsterBaselineCorrectionY('monster7'),
      },
      stats: monsterStats,
      patrolMin: MIN_X + 80,
      patrolMax: MAX_X - 80,
      hurtDurationMs: actionDurationMs(monster7Data.actions.hurt, TICK_MS),
      attackDurationMs: actionDurationMs(monster7Data.actions.hit1, TICK_MS),
      deadDurationMs: actionDurationMs(monster7Data.actions.dead, TICK_MS),
      attackCooldownMs: 1000,
      decisionIntervalMs: 1000,
      attack: MONSTER_ATTACKS.monster7.hit1,
      attackPower: attackPower.power,
      attackKind: attackPower.kind,
      hurtbox: { ...MONSTER7_HURTBOX },
      targetOffsetX: role1Data.offset.x * HERO_SCALE,
      selfOffsetX: monster7Data.offset.x * HERO_SCALE,
    }],
  }
  return validateCombatSessionDefinition(definition)
}
