import { describe, expect, it } from 'vitest'
import {
  PRESENTATION_CONTRACT_VERSION,
  type PresentationCue,
} from '@zaixu/presentation-contract'

describe('presentation contract', () => {
  it('preserves its exact version and generic payload', () => {
    const cue: PresentationCue<'camera.shake', { strength: number }> = {
      presentationVersion: PRESENTATION_CONTRACT_VERSION,
      tick: 42,
      type: 'camera.shake',
      payload: { strength: 0.5 },
    }

    expect(PRESENTATION_CONTRACT_VERSION).toBe('presentation@1')
    expect(cue.payload).toEqual({ strength: 0.5 })
  })
})
