import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}))
import {
  canStartRoom,
  isOwner,
  levelIdToIndex,
  reduceRoomState,
  roomMemberReady,
  type LobbyRoomView,
} from '../src/scenes/LobbyScene'
import type { RoomSnapshot } from '../src/net/socialClient'

const baseRoom: RoomSnapshot = {
  id: 'room-1',
  levelId: 'L1',
  ownerId: 'u1',
  status: 'waiting',
  members: [
    { userId: 'u1', username: '悟空', ready: false },
    { userId: 'u2', username: '八戒', ready: false },
  ],
}

describe('lobby room selectors', () => {
  it('detects the owner and the local ready state', () => {
    expect(isOwner(baseRoom, 'u1')).toBe(true)
    expect(isOwner(baseRoom, 'u2')).toBe(false)
    expect(roomMemberReady(baseRoom, 'u1')).toBe(false)
    expect(roomMemberReady({ ...baseRoom, members: [{ ...baseRoom.members[0], ready: true }] }, 'u1')).toBe(true)
  })

  it('only lets the owner start while the waiting room has every member ready', () => {
    const allReady: RoomSnapshot = {
      ...baseRoom,
      members: baseRoom.members.map((member) => ({ ...member, ready: true })),
    }

    expect(canStartRoom(baseRoom, 'u1')).toBe(false)
    expect(canStartRoom(allReady, 'u2')).toBe(false)
    expect(canStartRoom({ ...allReady, status: 'in_game' }, 'u1')).toBe(false)
    expect(canStartRoom(allReady, 'u1')).toBe(true)
  })

  it('maps social-server level ids to campaign indexes', () => {
    expect(levelIdToIndex('L1')).toBe(0)
    expect(levelIdToIndex('L2')).toBe(1)
  })
})

describe('lobby room reducer', () => {
  it('accepts room_state as the authoritative snapshot', () => {
    expect(reduceRoomState(null, { type: 'room_state', room: baseRoom })).toEqual(baseRoom)
  })

  it('applies member joins, ready changes, and owner transfer leaves', () => {
    const joined = reduceRoomState(baseRoom, { type: 'member_joined', member: { userId: 'u3', username: '沙僧' } })
    expect(joined?.members.at(-1)).toEqual({ userId: 'u3', username: '沙僧', ready: false })

    const ready = reduceRoomState(joined, { type: 'ready_changed', userId: 'u3', ready: true })
    expect(ready?.members.find((member) => member.userId === 'u3')?.ready).toBe(true)

    const left = reduceRoomState(ready, { type: 'member_left', userId: 'u1', newOwnerId: 'u2' })
    expect(left?.ownerId).toBe('u2')
    expect(left?.members.map((member) => member.userId)).toEqual(['u2', 'u3'])
  })

  it('ignores duplicate joins and non-state messages', () => {
    const duplicate = reduceRoomState(baseRoom, { type: 'member_joined', member: { userId: 'u2', username: '八戒' } })
    expect(duplicate?.members).toHaveLength(2)

    const unchanged: LobbyRoomView = reduceRoomState(baseRoom, { type: 'error', message: 'room is not ready' })
    expect(unchanged).toEqual(baseRoom)
  })
})
