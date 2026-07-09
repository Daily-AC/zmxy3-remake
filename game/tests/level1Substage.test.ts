import { describe, it, expect } from 'vitest'
import {
  createSubStageChainState,
  currentSubStage,
  isSubStageChainCleared,
  markCurrentSubStageCleared,
  tryAdvanceSubStage,
} from '../src/systems/level'
import { LEVEL_1_WUYING } from '../src/data/levels/level1'

describe('Level 1 substages (sl11 -> sl12 -> sl13)', () => {
  it('substage chain: sl11 clear condition (巫鹰 dead) -> door -> sl12 -> sl13 -> isLevelCleared', () => {
    const chain = createSubStageChainState(LEVEL_1_WUYING)

    expect(currentSubStage(chain).id).toBe('sl11')
    markCurrentSubStageCleared(chain)
    expect(tryAdvanceSubStage(chain, 1010, -2050, true)).toBe(true)

    expect(currentSubStage(chain).id).toBe('sl12')
    markCurrentSubStageCleared(chain)
    expect(tryAdvanceSubStage(chain, 4710, 400, true)).toBe(true)

    expect(currentSubStage(chain).id).toBe('sl13')
    markCurrentSubStageCleared(chain)
    expect(tryAdvanceSubStage(chain, 4710, 400, true)).toBe(true)

    expect(isSubStageChainCleared(chain)).toBe(true)
  })
})
