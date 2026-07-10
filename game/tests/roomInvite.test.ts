import { describe, expect, it, vi } from 'vitest'
import {
  roomIdFromInvite,
  roomShareUrl,
  shareRoomInvite,
  stripRoomInvite,
} from '../src/systems/roomInvite'

describe('room invite URLs', () => {
  it('builds a public room link without leaking debug query parameters', () => {
    expect(roomShareUrl('https://zaixu.qmledmq.cn:8443/?socialServer=http://localhost:5191#x', 'abc 123')).toBe(
      'https://zaixu.qmledmq.cn:8443/?room=abc+123',
    )
  })

  it('parses only non-empty room ids and strips the consumed invite', () => {
    expect(roomIdFromInvite('?room=abc%20123')).toBe('abc 123')
    expect(roomIdFromInvite('?room=%20%20')).toBeNull()
    expect(stripRoomInvite('https://example.test/game?room=abc&socialServer=x#top')).toBe(
      'https://example.test/game?socialServer=x#top',
    )
  })
})

describe('room invite sharing', () => {
  it('prefers Web Share when available', async () => {
    const share = vi.fn(async () => undefined)
    const writeText = vi.fn(async () => undefined)

    await expect(shareRoomInvite('https://example.test/?room=abc', { share, writeText })).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.test/?room=abc' }))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to clipboard and reports unavailable transports', async () => {
    const writeText = vi.fn(async () => undefined)
    await expect(shareRoomInvite('https://example.test/?room=abc', { writeText })).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://example.test/?room=abc')
    await expect(shareRoomInvite('https://example.test/?room=abc', {})).resolves.toBe('unavailable')
  })
})
