import { defineContentId } from '@zaixu/content'
import {
  MONSTER_ATTACKS,
  validateBattleDefinition,
  type BattleDefinition,
  type BattleMonsterDefinition,
} from '@zaixu/game-core'
import geometryRaw from '../data/levels/level1-geometry.json'
import { LEVEL1_MONSTER_STATS, LEVEL_1_WUYING } from '../data/levels/level1'
import { monsterAttackPower } from '../data/monsterAttackPower'
import monster3Raw from '../data/monsters/monster3.json'
import monster30Raw from '../data/monsters/monster30.json'
import role1Raw from '../data/roles/role1.json'
import { monsterBaselineCorrectionY } from '../presentation/actorVisualMetrics'
import { TICK_MS } from '../systems/tick'
import { actionDurationMs, type RoleData } from '../systems/roleData'
import { getRole1SkillMpCost } from '../systems/heroSkill'
import { getRole1MaxMp } from '../systems/mp'
import { calculateRealSkillDamage } from '../systems/skillDamageReal'
import { buildCombatCoreSliceDefinition } from './combatCoreDefinition'

const SCALE = 1.5
const HITBOX_REFERENCE_CELL = 200
const MONSTER_HURTBOX_BASE = { width: 120, height: 140 }
const MONSTER30_BULLET = {
  kind: 'Monster30Bullet1',
  speedPxPerSecond: 620,
  radius: 58,
  ttlMs: 900,
} as const

const monsterData: Record<'monster3' | 'monster30', RoleData> = {
  monster3: monster3Raw as RoleData,
  monster30: monster30Raw as RoleData,
}
const roleData = role1Raw as RoleData

interface GeometryFile {
  subStages: { id: string; walls: BattleDefinition['level']['walls'] }[]
}

export interface Sl11BattleProfile {
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

function ticks(ms: number): number {
  return Math.round(ms / TICK_MS)
}

function monsterDefinition(
  species: 'monster3' | 'monster30',
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

export function compileSl11BattleDefinition(
  seed: number,
  profile: Partial<Sl11BattleProfile> = {},
): BattleDefinition {
  const source = LEVEL_1_WUYING.subStages[0]
  const continuous = source.continuousSpawner
  if (!continuous?.heightTrigger) throw new Error('sl11 continuous spawner is incomplete')
  const geometry = (geometryRaw as GeometryFile).subStages.find((stage) => stage.id === source.id)
  const fallbackHero = buildCombatCoreSliceDefinition().hero
  const bounds = { ...source.bounds }
  const hero = {
    ...fallbackHero,
    spawn: { ...source.heroStart },
    groundY: source.heroStart.y,
    minX: bounds.left,
    maxX: bounds.right,
    maxHp: profile.maxHp ?? fallbackHero.maxHp,
    atk: profile.atk ?? fallbackHero.atk,
    def: profile.def ?? fallbackHero.def,
    magicDefenseFraction: profile.magicDefenseFraction ?? fallbackHero.magicDefenseFraction,
    critChance: profile.critChance ?? fallbackHero.critChance,
    maxMp: profile.maxMp ?? getRole1MaxMp(1),
    equipment: {
      weaponItemId: profile.weaponItemId ?? null,
      armorItemId: profile.armorItemId ?? null,
      weaponShowId: profile.weaponShowId ?? 0,
    },
    skills: {
      slz: {
        id: 'slz',
        action: 'hit6',
        learnedLevel: profile.slzLevel ?? 1,
        mpCost: getRole1SkillMpCost('slz', profile.slzLevel ?? 1),
        durationTicks: ticks(650),
        cooldownTicks: ticks(650),
        hitTick: 1,
        hitbox: { forward: 30, y: 40, width: 170, height: 150 },
        damage: Math.max(1, Math.round(calculateRealSkillDamage(
          'slz',
          profile.slzLevel ?? 1,
          profile.atk ?? fallbackHero.atk,
          { critChance: 0, random: () => 1 },
        ))),
        attackKind: 'physics' as const,
      },
    },
  }

  return validateBattleDefinition({
    version: 1,
    contentVersion: 'chapter-one-sl11@1',
    tickRate: 30,
    seed,
    provenance: [
      { ruleId: 'sl11.geometry', origin: 'canonical', source: 'game/src/data/levels/level1-geometry.json' },
      { ruleId: 'sl11.encounter', origin: 'canonical', source: 'game/src/data/levels/level1.ts' },
      { ruleId: 'role1.combat', origin: 'canonical', source: 'game/src/adapters/combatCoreDefinition.ts' },
      { ruleId: 'role1.skill.slz', origin: 'canonical', source: 'game/src/systems/skillDamageReal.ts' },
      { ruleId: 'monster30.flight', origin: 'adapted', source: 'game/src/scenes/BattleScene.ts#monsterConfigFor' },
    ],
    hero,
    monsters: {
      monster30: monsterDefinition('monster30', bounds),
      monster3: monsterDefinition('monster3', bounds),
    },
    level: {
      id: source.id,
      bounds,
      heroSpawn: { ...source.heroStart },
      walls: geometry?.walls.map((wall) => ({ ...wall })) ?? source.fallbackWalls.map((wall) => ({ ...wall })),
      encounters: [{
        kind: 'continuous',
        id: 'continuous-0',
        initialDelayTicks: ticks(continuous.initialDelayMs),
        intervalTicks: ticks(continuous.intervalMs),
        count: continuous.count,
        roster: continuous.roster.map((entry) => entry.species),
        spawnOffset: {
          x: { ...continuous.offsetX },
          y: { ...continuous.offsetY },
        },
        trigger: {
          kind: 'hero-height',
          atOrAboveY: continuous.heightTrigger.thresholdY,
          boss: {
            speciesId: continuous.heightTrigger.boss.species,
            x: continuous.heightTrigger.boss.x,
            y: continuous.heightTrigger.boss.y,
          },
        },
      }],
      door: { ...source.door },
    },
  })
}
