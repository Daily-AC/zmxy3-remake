import { describe, expect, it } from 'vitest'
import { computeVisibleBottomY, monsterBaselineCorrectionY } from '../src/presentation/actorVisualMetrics'

describe('actor visual metrics', () => {
  it('aligns real Role1 and Monster7 visible bottoms at 485.5', () => {
    expect(computeVisibleBottomY({ stateY: 400, offsetY: -15, scale: 1.5, cellH: 200, contentBottom: 172 })).toBe(485.5)
    expect(computeVisibleBottomY({ stateY: 400, offsetY: 0, scale: 1.5, cellH: 150, contentBottom: 130, baselineCorrectionY: monsterBaselineCorrectionY('monster7') })).toBe(485.5)
  })

  it('preserves every measured BattleScene species baseline correction', () => {
    expect(Object.fromEntries(
      [
        'monster2', 'monster3', 'monster4', 'monster5', 'monster6', 'monster7', 'monster8',
        'monster9', 'monster10', 'monster15', 'monster16', 'monster19', 'monster30',
      ].map((species) => [species, monsterBaselineCorrectionY(species)]),
    )).toEqual({
      monster2: -13.5,
      monster3: 9,
      monster4: 9,
      monster5: -16.5,
      monster6: -34.5,
      monster7: 3,
      monster8: 3,
      monster9: 3,
      monster10: 1.5,
      monster15: -25.5,
      monster16: -19.5,
      monster19: 9,
      monster30: 0,
    })
    expect(monsterBaselineCorrectionY('monster999')).toBe(0)
  })
})
