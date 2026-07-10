export interface RoomShareTransports {
  share?: (data: ShareData) => Promise<void>
  writeText?: (text: string) => Promise<void>
}

export type RoomShareResult = 'shared' | 'copied' | 'unavailable'

export function roomIdFromInvite(search: string): string | null {
  const roomId = new URLSearchParams(search).get('room')?.trim() ?? ''
  return roomId || null
}

export function roomShareUrl(href: string, roomId: string): string {
  const url = new URL(href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('room', roomId.trim())
  return url.toString()
}

export function stripRoomInvite(href: string): string {
  const url = new URL(href)
  url.searchParams.delete('room')
  return url.toString()
}

export async function shareRoomInvite(url: string, transports: RoomShareTransports): Promise<RoomShareResult> {
  if (transports.share) {
    try {
      await transports.share({ title: '再续西游联机房间', text: '加入我的联机房间', url })
      return 'shared'
    } catch {
      // A browser can expose Web Share while rejecting the current context.
    }
  }
  if (transports.writeText) {
    try {
      await transports.writeText(url)
      return 'copied'
    } catch {
      return 'unavailable'
    }
  }
  return 'unavailable'
}
