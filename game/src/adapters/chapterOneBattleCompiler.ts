import { defineContentId } from '@zaixu/content'
import {
  MONSTER_ATTACKS,
  type BattleDefinition,
  type BattleHeroDefinition,
  type BattleMonsterDefinition,
} from '@zaixu/game-core'
import { LEVEL1_MONSTER_STATS } from '../data/levels/level1'
import { monsterAttackPower } from '../data/monsterAttackPower'
import monster2Raw from '../data/monsters/monster2.json'
import monster3Raw from '../data/monsters/monster3.json'
import monster4Raw from '../data/monsters/monster4.json'
import monster5Raw from '../data/monsters/monster5.json'
import monster7Raw from '../data/monsters/monster7.json'
import monster8Raw from '../data/monsters/monster8.json'
import monster30Raw from '../data/monsters/monster30.json'
import role1Raw from '../data/roles/role1.json'
import { monsterBaselineCorrectionY } from '../presentation/actorVisualMetrics'
import { getRole1SkillMpCost } from '../systems/heroSkill'
import { getRole1MaxMp } from '../systems/mp'
import { actionDurationMs, type RoleData } from '../systems/roleData'
import { calculateRealSkillDamage } from '../systems/skillDamageReal'
import { TICK_MS } from '../systems/tick'
import { buildCombatCoreSliceDefinition } from './combatCoreDefinition'

const SCALE = 1.5
const HITBOX_REFERENCE_CELL = 200
const MONSTER_HURTBOX_BASE = { width: 120, height: 140 }
const MONSTER30_BULLET = {
  kind: 'Monster30Bullet1', speedPxPerSecond: 620, radius: 58, ttlMs: 900,
} as const

export type ChapterOneMonsterId = 'monster2' | 'monster3' | 'monster4' | 'monster5' | 'monster7' | 'monster8' | 'monster30'

const monsterData: Record<ChapterOneMonsterId, RoleData> = {
  monster2: monster2Raw as RoleData,
  monster3: monster3Raw as RoleData,
  monster4: monster4Raw as RoleData,
  monster5: monster5Raw as RoleData,
  monster7: monster7Raw as RoleData,
  monster8: monster8Raw as RoleData,
  monster30: monster30Raw as RoleData,
}
const roleData = role1Raw as RoleData

export interface ChapterOneBattleProfile {
  maxHp: number
  atk: number
  def: number
  magicDefenseFraction: number
  critChance: number
  maxMp: number
  slzLevel: number
  weaponItemId: string | null
  armorItemId: string | null
  weaponShowId: number
}

export function battleTicks(ms: number): number {
  return Math.round(ms / TICK_MS)
}

export function compileChapterOneMonster(
  species: ChapterOneMonsterId,
  bounds: BattleDefinition['level']['bounds'],
): BattleMonsterDefinition {
  const data = monsterData[species]
  const stats = LEVEL1_MONSTER_STATS[species]
  const power = monsterAttackPower(species, stats)
  const sourceAttack = MONSTER_ATTACKS[species].hit1
  const attack = sourceAttack.hitbox.width > 0 && sourceAttack.hitbox.height > 0
    ? sourceAttack
    : { ...sourceAttack, hitbox: { ...sourceAttack.hitbox, width: 1, height: 1 } }

  return {
    contentId: defineContentId(`monster.chapter1.${species}`),
    collisionOffset: {
      x: data.offset.x * SCALE,
      y: data.offset.y * SCALE + monsterBaselineCorrectionY(species),
    },
    stats: { ...stats },
    patrolMin: bounds.left + 80,
    patrolMax: bounds.right - 80,
    hurtDurationMs: actionDurationMs(data.actions.hurt, TICK_MS),
    attackDurationMs: actionDurationMs(data.actions.hit1, TICK_MS),
    deadDurationMs: actionDurationMs(data.actions.dead, TICK_MS),
    attackCooldownMs: 1000,
    decisionIntervalMs: 1000,
    attack,
    attackPower: power.power,
    attackKind: power.kind,
    hurtbox: {
      width: MONSTER_HURTBOX_BASE.width * (data.sheet.cellW / HITBOX_REFERENCE_CELL),
      height: MONSTER_HURTBOX_BASE.height * (data.sheet.cellH / HITBOX_REFERENCE_CELL),
    },
    targetOffsetX: roleData.offset.x * SCALE,
    selfOffsetX: data.offset.x * SCALE,
    ...(species === 'monster30'
      ? {
          behavior: {
            verticalFollow: { enabled: true, speed: stats.speed, arriveThreshold: 20 },
            rangedAttack: { ...MONSTER30_BULLET },
          },
        }
      : {}),
  }
}

export function compileWukongBattleHero(
  spawn: { x: number; y: number },
  bounds: BattleDefinition['level']['bounds'],
  profile: Partial<ChapterOneBattleProfile> = {},
): BattleHeroDefinition {
  const fallback = buildCombatCoreSliceDefinition().hero
  const slzLevel = profile.slzLevel ?? 1
  const atk = profile.atk ?? fallback.atk
  return {
    ...fallback,
    spawn: { ...spawn },
    groundY: spawn.y,
    minX: bounds.left,
    maxX: bounds.right,
    maxHp: profile.maxHp ?? fallback.maxHp,
    atk,
    def: profile.def ?? fallback.def,
    magicDefenseFraction: profile.magicDefenseFraction ?? fallback.magicDefenseFraction,
    critChance: profile.critChance ?? fallback.critChance,
    maxMp: profile.maxMp ?? getRole1MaxMp(1),
    equipment: {
      weaponItemId: profile.weaponItemId ?? null,
      armorItemId: profile.armorItemId ?? null,
      weaponShowId: profile.weaponShowId ?? 0,
    },
    skills: {
      slz: {
        id: 'slz', action: 'hit6', learnedLevel: slzLevel,
        mpCost: getRole1SkillMpCost('slz', slzLevel),
        durationTicks: battleTicks(650), cooldownTicks: battleTicks(650), hitTick: 1,
        hitbox: { forward: 30, y: 40, width: 170, height: 150 },
        damage: Math.max(1, Math.round(calculateRealSkillDamage(
          'slz', slzLevel, atk, { critChance: 0, random: () => 1 },
        ))),
        attackKind: 'physics',
      },
    },
  }
}
