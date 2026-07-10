import { describe, expect, it } from 'vitest'
import { schoolCardLayout } from '../src/ui/skillTreeLayout'

describe('schoolCardLayout', () => {
  it('keeps the school artwork below the header divider', () => {
    const layout = schoolCardLayout(90)

    expect(layout.iconTop).toBeGreaterThan(layout.dividerY + 6)
    expect(layout.nameY).toBeGreaterThan(layout.dividerY + 10)
  })

  it('keeps both status lines inside the 205px card', () => {
    const cardY = 90
    const layout = schoolCardLayout(cardY)

    expect(layout.costY).toBeLessThan(cardY + 205 - 18)
    expect(layout.levelY).toBeLessThan(layout.costY)
  })
})
