import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, type ProtocolEnvelope } from '@zaixu/protocol'

describe('protocol contract', () => {
  it('preserves its exact version and generic payload', () => {
    const envelope: ProtocolEnvelope<{ action: string }> = {
      protocolVersion: PROTOCOL_VERSION,
      sequence: 7,
      payload: { action: 'attack' },
    }

    expect(PROTOCOL_VERSION).toBe('combat-session@1')
    expect(envelope.protocolVersion).toBe('combat-session@1')
    expect(envelope.payload).toEqual({ action: 'attack' })
  })
})
