import { RuleProvenanceSchema } from '@zaixu/content'
import { z } from 'zod'
import {
  HeroCombatDefinitionBaseSchema,
  MonsterCombatDefinitionBaseSchema,
  refineHeroCombatBounds,
  refineMonsterPatrolBounds,
} from '../session/definition'
import { assertPlainData } from '../session/plainData'
import { cloneSerializable } from '../session/snapshot'
import type { BattleDefinition } from './types'

const finite = z.number().finite()
const nonNegativeInteger = z.number().int().nonnegative()
const positiveInteger = z.number().int().positive()
const stableId = z.string().trim().min(1)

const PointSchema = z.object({ x: finite, y: finite }).strict()
const NumberRangeSchema = z.object({ min: finite, max: finite }).strict().superRefine((range, context) => {
  if (range.max < range.min) {
    context.addIssue({ code: 'custom', message: 'max must be greater than or equal to min', path: ['max'] })
  }
})
const BoundsSchema = z.object({ left: finite, right: finite, top: finite, bottom: finite }).strict()
  .superRefine((bounds, context) => {
    if (bounds.right < bounds.left) {
      context.addIssue({ code: 'custom', message: 'right must be greater than or equal to left', path: ['right'] })
    }
    if (bounds.bottom < bounds.top) {
      context.addIssue({ code: 'custom', message: 'bottom must be greater than or equal to top', path: ['bottom'] })
    }
  })
const WallSchema = z.object({
  type: z.enum(['solid', 'through', 'throughUpButDown', 'throughDownButUp']),
  x: finite,
  y: finite,
  width: finite.positive(),
  height: finite.positive(),
  rotation: finite.optional(),
}).strict()
const SkillDefinitionSchema = z.object({
  id: stableId,
  action: stableId,
  learnedLevel: z.number().int().min(0).max(18),
  mpCost: finite.nonnegative(),
  durationTicks: positiveInteger,
  cooldownTicks: nonNegativeInteger,
  hitTick: positiveInteger,
  hitbox: z.object({
    forward: finite,
    y: finite,
    width: finite.positive(),
    height: finite.positive(),
  }).strict(),
  damage: finite.nonnegative(),
  attackKind: z.enum(['physics', 'magic']),
}).strict().superRefine((skill, context) => {
  if (skill.hitTick >= skill.durationTicks) {
    context.addIssue({ code: 'custom', message: 'skill hit tick must occur before its end tick', path: ['hitTick'] })
  }
})
const LootRollSchema = z.object({
  chance: finite.min(0).max(1),
  choices: z.array(z.object({
    lootId: stableId,
    weight: finite.positive(),
    motion: z.enum(['falling', 'homing']).optional(),
    quantity: z.object({ min: positiveInteger, max: positiveInteger }).strict(),
  }).strict()).min(1),
}).strict().superRefine((roll, context) => {
  roll.choices.forEach((choice, index) => {
    if (choice.quantity.max < choice.quantity.min) {
      context.addIssue({
        code: 'custom',
        message: 'max must be greater than or equal to min',
        path: ['choices', index, 'quantity', 'max'],
      })
    }
  })
})
const BattleHeroDefinitionSchema = HeroCombatDefinitionBaseSchema.extend({
  maxMp: finite.nonnegative(),
  skills: z.record(stableId, SkillDefinitionSchema),
  equipment: z.object({
    weaponItemId: stableId.nullable(),
    armorItemId: stableId.nullable(),
    weaponShowId: nonNegativeInteger,
  }).strict(),
}).superRefine(refineHeroCombatBounds)
const TimedSpawnSchema = z.object({
  speciesId: stableId,
  x: finite,
  y: finite,
  delayTicks: nonNegativeInteger,
  intervalTicks: positiveInteger,
  quantity: positiveInteger,
}).strict()
const ContinuousEncounterSchema = z.object({
  kind: z.literal('continuous'),
  id: stableId,
  initialDelayTicks: nonNegativeInteger,
  intervalTicks: positiveInteger,
  count: positiveInteger,
  roster: z.array(stableId).min(1),
  spawnOffset: z.object({ x: NumberRangeSchema, y: NumberRangeSchema }).strict(),
  trigger: z.object({
    kind: z.literal('hero-height'),
    atOrAboveY: finite,
    boss: z.object({ speciesId: stableId, x: finite, y: finite }).strict(),
  }).strict(),
}).strict()
const StopPointEncounterSchema = z.object({
  kind: z.literal('stop-point'),
  id: stableId,
  stopX: finite,
  boss: z.boolean(),
  spawns: z.array(TimedSpawnSchema).min(1),
}).strict()
const EncounterSchema = z.discriminatedUnion('kind', [ContinuousEncounterSchema, StopPointEncounterSchema])
const MonsterDefinitionSchema = MonsterCombatDefinitionBaseSchema
  .omit({ id: true, spawn: true })
  .extend({
    behavior: z.object({
      verticalFollow: z.object({
        enabled: z.boolean(),
        speed: finite.nonnegative(),
        arriveThreshold: finite.nonnegative(),
      }).strict().optional(),
      rangedAttack: z.object({
        kind: stableId,
        speedPxPerSecond: finite.positive(),
        radius: finite.positive(),
        ttlMs: finite.positive(),
        spawnOffsetX: finite.optional(),
        spawnOffsetY: finite.optional(),
      }).strict().optional(),
    }).strict().optional(),
    loot: z.array(LootRollSchema).optional(),
  })
  .superRefine(refineMonsterPatrolBounds)

export const BattleDefinitionSchema = z.object({
  version: z.literal(1),
  contentVersion: z.string().trim().min(1),
  tickRate: z.literal(30),
  seed: z.number().int().min(0).max(0xffffffff),
  provenance: z.array(RuleProvenanceSchema),
  hero: BattleHeroDefinitionSchema,
  monsters: z.record(stableId, MonsterDefinitionSchema),
  level: z.object({
    id: stableId,
    bounds: BoundsSchema,
    heroSpawn: PointSchema,
    walls: z.array(WallSchema).min(1),
    encounters: z.array(EncounterSchema).min(1),
    door: z.object({ x: finite, y: finite, width: finite.positive(), height: finite.positive() }).strict(),
    lootPhysics: z.object({
      gravityPerTick: finite.nonnegative(),
      spawnOffsetY: finite,
      pickupRadius: finite.positive(),
      retryDelayTicks: positiveInteger,
    }).strict().optional(),
  }).strict(),
}).strict().superRefine((definition, context) => {
  const { bounds, door, heroSpawn, encounters } = definition.level
  for (const [skillId, skill] of Object.entries(definition.hero.skills)) {
    if (skill.id !== skillId) {
      context.addIssue({ code: 'custom', message: 'skill id must match its registry key', path: ['hero', 'skills', skillId, 'id'] })
    }
  }
  const inside = (x: number, y: number): boolean =>
    x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom

  if (!inside(heroSpawn.x, heroSpawn.y)) {
    if (heroSpawn.x < bounds.left || heroSpawn.x > bounds.right) {
      context.addIssue({ code: 'custom', message: 'hero spawn x must be inside bounds', path: ['level', 'heroSpawn', 'x'] })
    }
    if (heroSpawn.y < bounds.top || heroSpawn.y > bounds.bottom) {
      context.addIssue({ code: 'custom', message: 'hero spawn y must be inside bounds', path: ['level', 'heroSpawn', 'y'] })
    }
  }
  if (door.x < bounds.left || door.x + door.width > bounds.right) {
    context.addIssue({ code: 'custom', message: 'door x range must be inside bounds', path: ['level', 'door', 'x'] })
  }
  if (door.y < bounds.top || door.y + door.height > bounds.bottom) {
    context.addIssue({ code: 'custom', message: 'door y range must be inside bounds', path: ['level', 'door', 'y'] })
  }

  const encounterIds = new Set<string>()
  encounters.forEach((encounter, encounterIndex) => {
    if (encounterIds.has(encounter.id)) {
      context.addIssue({ code: 'custom', message: 'encounter id must be unique', path: ['level', 'encounters', encounterIndex, 'id'] })
    }
    encounterIds.add(encounter.id)
    const species = encounter.kind === 'continuous'
      ? [...encounter.roster, encounter.trigger.boss.speciesId]
      : encounter.spawns.map((spawn) => spawn.speciesId)
    species.forEach((speciesId, speciesIndex) => {
      if (definition.monsters[speciesId]) return
      const suffix = encounter.kind === 'continuous' && speciesIndex === encounter.roster.length
        ? ['trigger', 'boss', 'speciesId']
        : encounter.kind === 'continuous'
          ? ['roster', speciesIndex]
          : ['spawns', speciesIndex, 'speciesId']
      context.addIssue({
        code: 'custom',
        message: `unknown monster species: ${speciesId}`,
        path: ['level', 'encounters', encounterIndex, ...suffix],
      })
    })
  })
})

export function validateBattleDefinition(input: unknown): BattleDefinition {
  assertPlainData(input, 'battle definition')
  return cloneSerializable(BattleDefinitionSchema.parse(input)) as BattleDefinition
}
