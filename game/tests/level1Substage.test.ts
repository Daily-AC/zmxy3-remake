import { describe, it, expect } from 'vitest'
import {
  createSubStageChainState,
  currentSubStage,
  isSubStageChainCleared,
  markCurrentSubStageCleared,
  tryAdvanceSubStage,
} from '../src/systems/level'
import { LEVEL_1_WUYING, LEVEL_2_TIANGONGDAO } from '../src/data/levels/level1'

describe('Single-stage campaign level chains', () => {
  it.each([
    ['九重天', LEVEL_1_WUYING, 'sl11'],
    ['天宫道', LEVEL_2_TIANGONGDAO, 'sl12'],
  ] as const)('%s clears through its own transfer door and returns control to the campaign', (_name, def, stageId) => {
    const chain = createSubStageChainState(def)

    expect(currentSubStage(chain).id).toBe(stageId)
    markCurrentSubStageCleared(chain)
    const door = chain.doors[0]
    expect(tryAdvanceSubStage(chain, door.x + 1, door.y + 1, true)).toBe(true)

    expect(isSubStageChainCleared(chain)).toBe(true)
  })
})
