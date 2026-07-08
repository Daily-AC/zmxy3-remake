import { describe, it, expect } from 'vitest'
import {
  normalizeNode,
  indexInstances,
  countFrames,
  isMultiFrame,
  approximateRotation,
  IDENTITY_MATRIX,
  type PrefabDocument,
  type PrefabNode,
} from '../src/prefab/PrefabLoader'
import passiveSkillControlFixture from './fixtures/passiveSkillControl.prefab.json'
import s1_1Fixture from './fixtures/s1_1.prefab.json'

// Sample JSON straight from tools/prefab-compiler (PassiveSkillControl,
// Symbol 769 -- the real symbol target C2 replaces buildPassivePanel's
// hand-collage with) and the worldmap node-origin regression symbol (s1_1),
// so this test exercises the loader against ACTUAL compiler output, not an
// invented shape -- matches the brief's "加载样例 JSON 断言树结构/坐标/origin".

const passiveDoc = passiveSkillControlFixture as unknown as PrefabDocument
const s1_1Doc = s1_1Fixture as unknown as PrefabDocument

describe('normalizeNode', () => {
  it('fills identity matrix and zero origin when the compiler omitted them (root nodes)', () => {
    const n = normalizeNode({ type: 'container' })
    expect(n.matrix).toEqual(IDENTITY_MATRIX)
    expect(n.originFrac).toEqual({ x: 0, y: 0 })
    expect(n.instanceName).toBeNull()
  })

  it('does not mutate the input node', () => {
    const input: PrefabNode = { type: 'image' }
    normalizeNode(input)
    expect(input.matrix).toBeUndefined()
  })

  it('preserves an explicit matrix/origin instead of overwriting it', () => {
    const n = normalizeNode({
      type: 'image',
      matrix: { tx: 5, ty: 6, scaleX: 2, scaleY: 2, rotSkew0: 0, rotSkew1: 0 },
      originFrac: { x: 0.5, y: 0.5 },
    })
    expect(n.matrix?.tx).toBe(5)
    expect(n.originFrac).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe('approximateRotation', () => {
  it('is 0 for an axis-aligned matrix', () => {
    expect(approximateRotation(IDENTITY_MATRIX)).toBe(0)
  })

  it('derives an angle from rotSkew terms', () => {
    // 90 degree rotation: scaleX=0, rotSkew0=1
    const m = { tx: 0, ty: 0, scaleX: 0, scaleY: 0, rotSkew0: 1, rotSkew1: -1 }
    expect(approximateRotation(m)).toBeCloseTo(Math.PI / 2, 5)
  })
})

describe('countFrames / isMultiFrame', () => {
  it('a static node has exactly 1 frame', () => {
    const n = normalizeNode({ type: 'container', children: [] })
    expect(countFrames(n)).toBe(1)
    expect(isMultiFrame(n)).toBe(false)
  })

  it('a compiled multi-frame sprite (pskill icon slot, 6 frames) reports frameCount from its own frames array', () => {
    const bg = passiveDoc.root.children![0]
    expect(bg.characterId).toBe(758)
    const slot = passiveDoc.root.children![1]
    expect(slot.characterId).toBe(768)
    expect(countFrames(slot)).toBe(6)
    expect(isMultiFrame(slot)).toBe(true)
  })
})

describe('indexInstances', () => {
  it('finds no named instances in PassiveSkillControl (compiler confirms none baked -- report notes AS3 names it dynamically)', () => {
    const map = indexInstances(passiveDoc.root)
    expect(map.size).toBe(0)
  })

  it('throws on a duplicate instanceName rather than silently shadowing it', () => {
    const dup: PrefabNode = {
      type: 'container',
      children: [
        { type: 'image', instanceName: 'dup' },
        { type: 'image', instanceName: 'dup' },
      ],
    }
    expect(() => indexInstances(dup)).toThrow(/duplicate instanceName/)
  })
})

describe('compiled PassiveSkillControl tree matches tasks/skilltree-report.md §1.2', () => {
  it('has a bg shape + 5 pskill icon slots, in order', () => {
    const children = passiveDoc.root.children!
    expect(children).toHaveLength(6)
    expect(children[0]).toMatchObject({ type: 'image', characterId: 758 })
    for (const slot of children.slice(1)) {
      expect(slot).toMatchObject({ type: 'container', characterId: 768 })
    }
  })

  it('pskill1..5 y-coordinates match the report (144.95/221.95/304.95/381.95/460.95)', () => {
    const slots = passiveDoc.root.children!.slice(1)
    const expectedY = [144.95, 221.95, 304.95, 381.95, 460.95]
    slots.forEach((slot, i) => {
      expect(slot.matrix!.ty).toBeCloseTo(expectedY[i], 2)
      expect([122, 124]).toContain(Math.round(slot.matrix!.tx))
    })
  })

  it('bg bounds (746x429) match the real exported passive_panel.png dimensions the report recorded', () => {
    const bg = passiveDoc.root.children![0]
    expect(bg.boundsPx?.w).toBeCloseTo(746, 0)
    expect(bg.boundsPx?.h).toBeCloseTo(429, 0)
  })
})

describe('compiled s1_1 world-map node origin matches the mandated truth value', () => {
  it('origin = (0.495, 0.659)', () => {
    expect(s1_1Doc.root.originFrac!.x).toBeCloseTo(0.495, 3)
    expect(s1_1Doc.root.originFrac!.y).toBeCloseTo(0.659, 3)
  })
})
