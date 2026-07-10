import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (name: string) => readFileSync(new URL(`../src/scenes/${name}`, import.meta.url), 'utf8')

describe('room invite scene flow', () => {
  it('routes existing and newly-created players to the lobby when a room invite is present', () => {
    expect(read('LoginScene.ts')).toMatch(/roomIdFromInvite\(window\.location\.search\)/)
    expect(read('CharacterSelectScene.ts')).toMatch(/roomIdFromInvite\(window\.location\.search\)/)
  })

  it('auto-joins the query room once and exposes an in-room share action', () => {
    const lobby = read('LobbyScene.ts')
    expect(lobby).toMatch(/inviteJoinAttempted/)
    expect(lobby).toMatch(/roomIdFromInvite\(window\.location\.search\)/)
    expect(lobby).toMatch(/stripRoomInvite\(window\.location\.href\)/)
    expect(lobby).toMatch(/shareRoomInvite/)
  })
})
