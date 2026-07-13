import { describe, expect, it } from 'vitest'
import { SAVE_SCHEMA_VERSION, type SaveEnvelope } from '@zaixu/save-schema'

describe('save schema contract', () => {
  it('preserves its exact version and generic payload', () => {
    const envelope: SaveEnvelope<{ level: number }> = {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      data: { level: 12 },
    }

    expect(SAVE_SCHEMA_VERSION).toBe('profile@1')
    expect(envelope.saveSchemaVersion).toBe('profile@1')
    expect(envelope.data).toEqual({ level: 12 })
  })
})
