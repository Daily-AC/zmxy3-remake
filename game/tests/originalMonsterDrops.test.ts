import { describe, expect, it } from 'vitest'
import monsterDrops from '../src/data/original/monster-drops.json'
import equipment from '../src/data/original/equipment.json'
import { monsterSoulDropAmount } from '../src/systems/dropRoll'

type GxpEntry = { condition: string; value: number }
type MonsterDropRecord = {
  className: string
  gxp?: GxpEntry[]
  fallList?: { condition: string; value: { name: string; bigtype: string }[] }[]
}

function monster(className: string): MonsterDropRecord {
  const found = (monsterDrops.monsters as MonsterDropRecord[]).find((entry) => entry.className === className)
  if (!found) throw new Error(`missing ${className}`)
  return found
}

describe('original monster drop table gxp (BaseMonster.as:901 auraRed power=gxp*2)', () => {
  it('includes gxp for Monster30/Monster4/Monster5 from their AS3 constructors', () => {
    expect(monster('Monster30').gxp).toEqual([{ condition: 'default', value: 1 }])
    expect(monster('Monster4').gxp).toEqual([{ condition: 'default', value: 10 }])
    expect(monster('Monster5').gxp).toEqual([{ condition: 'default', value: 15 }])
  })

  it('computes collectible soul orb amounts from gxp*2 for crow/千里眼/巨灵神', () => {
    expect(monsterSoulDropAmount('monster30')).toBe(2)
    expect(monsterSoulDropAmount('monster4')).toBe(20)
    expect(monsterSoulDropAmount('monster5')).toBe(30)
  })
})

describe('original L1 fallList item provenance', () => {
  it('resolves every L1 fallList fillName to original/equipment.json', () => {
    const fillNames = new Set(equipment.items.map((item) => item.fillName))
    const l1Classes = ['Monster2', 'Monster3', 'Monster4', 'Monster5', 'Monster7', 'Monster8', 'Monster30']
    const missing: string[] = []

    for (const className of l1Classes) {
      for (const entry of monster(className).fallList ?? []) {
        for (const item of entry.value) {
          if (!fillNames.has(item.name)) missing.push(`${className}:${entry.condition}:${item.name}`)
        }
      }
    }

    expect(missing).toEqual([])
  })
})
