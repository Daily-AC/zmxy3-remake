import { ContentIdSchema, RuleProvenanceSchema } from '@zaixu/content'
import { z } from 'zod'
import { cloneSerializable } from './snapshot'
import type { CombatSessionDefinition } from './types'

const finiteNumber = z.number().finite()
const nonNegativeNumber = finiteNumber.nonnegative()
const positiveNumber = finiteNumber.positive()
const probability = finiteNumber.min(0).max(1)
const actorId = z.string().trim().min(1)

const PointSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
}).strict()

const BoxSizeSchema = z.object({
  width: positiveNumber,
  height: positiveNumber,
}).strict()

const AttackSpecSchema = z.object({
  action: z.string().trim().min(1),
  hitFrameFractions: z.array(probability).min(1),
  hitbox: z.object({
    forward: finiteNumber,
    y: finiteNumber,
    width: positiveNumber,
    height: positiveNumber,
  }).strict(),
}).strict()

const NormalAttacksSchema = z.object({
  hit1: AttackSpecSchema,
  hit2: AttackSpecSchema,
  hit3: AttackSpecSchema,
  hit4: AttackSpecSchema,
  hit5: AttackSpecSchema,
}).strict().superRefine((attacks, context) => {
  for (const key of ['hit1', 'hit2', 'hit3', 'hit4', 'hit5'] as const) {
    if (attacks[key].action !== key) {
      context.addIssue({
        code: 'custom',
        message: `normal attack action must match ${key}`,
        path: [key, 'action'],
      })
    }
  }
})

const HeroCombatDefinitionSchema = z.object({
  id: actorId,
  contentId: ContentIdSchema,
  spawn: PointSchema,
  collisionOffset: PointSchema,
  groundY: finiteNumber,
  minX: finiteNumber,
  maxX: finiteNumber,
  maxHp: positiveNumber,
  atk: nonNegativeNumber,
  def: nonNegativeNumber,
  magicDefenseFraction: probability,
  critChance: probability,
  comboStageDurationsMs: z.array(positiveNumber).length(5),
  comboGraceMs: nonNegativeNumber,
  normalAttacks: NormalAttacksSchema,
  hurtbox: BoxSizeSchema,
  hurtDurationMs: nonNegativeNumber,
  respawnDelayMs: nonNegativeNumber,
}).strict().superRefine((hero, context) => {
  if (hero.minX > hero.maxX) {
    context.addIssue({ code: 'custom', message: 'maxX must be greater than or equal to minX', path: ['maxX'] })
  }
})

const MonsterStatsSchema = z.object({
  hp: positiveNumber,
  speed: nonNegativeNumber,
  attackRange: nonNegativeNumber,
  alertRange: nonNegativeNumber,
  normalAttackRate: probability,
  def: nonNegativeNumber,
  mDef: probability.optional(),
}).strict()

const MonsterCombatDefinitionSchema = z.object({
  id: actorId,
  contentId: ContentIdSchema,
  spawn: PointSchema,
  collisionOffset: PointSchema,
  stats: MonsterStatsSchema,
  patrolMin: finiteNumber,
  patrolMax: finiteNumber,
  hurtDurationMs: nonNegativeNumber,
  attackDurationMs: nonNegativeNumber,
  deadDurationMs: nonNegativeNumber,
  attackCooldownMs: nonNegativeNumber,
  decisionIntervalMs: positiveNumber,
  attack: AttackSpecSchema,
  attackPower: nonNegativeNumber,
  attackKind: z.enum(['physics', 'magic']),
  hurtbox: BoxSizeSchema,
  targetOffsetX: finiteNumber,
  selfOffsetX: finiteNumber,
}).strict().superRefine((monster, context) => {
  if (monster.patrolMin > monster.patrolMax) {
    context.addIssue({
      code: 'custom',
      message: 'patrolMax must be greater than or equal to patrolMin',
      path: ['patrolMax'],
    })
  }
})

const ProvenanceSchema = RuleProvenanceSchema.superRefine((entry, context) => {
  if (entry.ruleId.trim().length === 0) {
    context.addIssue({ code: 'custom', message: 'ruleId must be non-empty', path: ['ruleId'] })
  }
  if (entry.source.trim().length === 0) {
    context.addIssue({ code: 'custom', message: 'source must be non-empty', path: ['source'] })
  }
})

export const CombatSessionDefinitionSchema = z.object({
  version: z.literal(1),
  contentVersion: z.string().trim().min(1),
  tickRate: z.literal(30),
  seed: z.number().int().min(0).max(0xffffffff),
  provenance: z.array(ProvenanceSchema),
  hero: HeroCombatDefinitionSchema,
  monsters: z.array(MonsterCombatDefinitionSchema),
}).strict().superRefine((definition, context) => {
  const ids = new Set<string>([definition.hero.id])
  definition.monsters.forEach((monster, index) => {
    if (ids.has(monster.id)) {
      context.addIssue({ code: 'custom', message: 'actor id must be unique', path: ['monsters', index, 'id'] })
    }
    ids.add(monster.id)
  })
})

function assertPlainData(input: unknown): void {
  const ancestors = new WeakSet<object>()
  const visitDataProperty = (owner: object, key: PropertyKey): void => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key)
    if (!descriptor) throw new TypeError('combat session definition contains an invalid property')
    if ('get' in descriptor || 'set' in descriptor) {
      throw new TypeError('combat session definition must not contain accessors')
    }
    if (!descriptor.enumerable) {
      throw new TypeError('combat session definition must not contain non-enumerable properties')
    }
    visit(descriptor.value)
  }
  const visit = (value: unknown): void => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return
    if (typeof value !== 'object') throw new TypeError('combat session definition must contain only plain data')
    if (ancestors.has(value)) throw new TypeError('combat session definition must not contain cycles')
    ancestors.add(value)
    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) {
          throw new TypeError('combat session definition must contain only plain arrays')
        }
        for (const key of Reflect.ownKeys(value)) {
          if (typeof key === 'symbol') {
            throw new TypeError('combat session definition arrays must not contain symbol keys')
          }
          if (key === 'length') continue
          const index = Number(key)
          if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
            throw new TypeError('combat session definition arrays may contain only indexes and length')
          }
          visitDataProperty(value, key)
        }
        return
      }
      const prototype = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('combat session definition must contain only plain objects')
      }
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === 'symbol') {
          throw new TypeError('combat session definition objects must not contain symbol keys')
        }
        visitDataProperty(value, key)
      }
    } finally {
      ancestors.delete(value)
    }
  }
  visit(input)
}

export function validateCombatSessionDefinition(input: unknown): CombatSessionDefinition {
  assertPlainData(input)
  return cloneSerializable(CombatSessionDefinitionSchema.parse(input))
}
