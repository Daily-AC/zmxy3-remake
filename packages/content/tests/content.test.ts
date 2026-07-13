import { describe, expect, it } from 'vitest'
import {
  RuleProvenanceSchema,
  assertUniqueContentIds,
  defineContentId,
} from '@zaixu/content'

describe('content ids', () => {
  it('accepts namespaced content ids', () => {
    expect(defineContentId('item.zaixu.tail_fire_staff')).toBe('item.zaixu.tail_fire_staff')
    expect(defineContentId('stage.chapter1.nine_heavens')).toBe('stage.chapter1.nine_heavens')
  })

  it('rejects ids without a namespace or with invalid segments', () => {
    expect(() => defineContentId('tail_fire_staff')).toThrow()
    expect(() => defineContentId('item.Zaixu.tail_fire_staff')).toThrow()
    expect(() => defineContentId('item..tail_fire_staff')).toThrow()
  })

  it('rejects duplicate content ids', () => {
    const id = defineContentId('item.zaixu.tail_fire_staff')

    expect(() => assertUniqueContentIds([id, id])).toThrow('duplicate content id')
  })
})

describe('rule provenance', () => {
  const validProvenance = {
    ruleId: 'combat.hero.basic_attack',
    source: 'game/src/systems/heroCombat.ts',
    origin: 'canonical',
  } as const

  it('accepts a complete provenance record', () => {
    expect(RuleProvenanceSchema.parse(validProvenance)).toEqual(validProvenance)
  })

  it('rejects unknown keys', () => {
    expect(() => RuleProvenanceSchema.parse({ ...validProvenance, note: 'extra' })).toThrow()
  })

  it('rejects empty rule ids and sources', () => {
    expect(() => RuleProvenanceSchema.parse({ ...validProvenance, ruleId: '' })).toThrow()
    expect(() => RuleProvenanceSchema.parse({ ...validProvenance, source: '' })).toThrow()
  })

  it('rejects invalid origins', () => {
    expect(() => RuleProvenanceSchema.parse({ ...validProvenance, origin: 'derived' })).toThrow()
  })
})
