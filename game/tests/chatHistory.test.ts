import { describe, expect, it } from 'vitest'
import { CHAT_HISTORY_LIMIT, chatHistoryKey, loadChatHistory, saveChatHistory, type ChatMessage } from '../src/systems/chatHistory'

// In-memory stand-in for `Storage` (localStorage), same pattern as
// save.test.ts's stub -- there's no jsdom localStorage in this project's
// node-based vitest environment.
class FakeStorage {
  private data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
}

describe('chatHistoryKey', () => {
  it('namespaces by username', () => {
    expect(chatHistoryKey('alice')).toBe('zmxy.laojun.chat.alice')
  })

  it('falls back to guest for an empty username', () => {
    expect(chatHistoryKey('')).toBe('zmxy.laojun.chat.guest')
  })
})

describe('loadChatHistory / saveChatHistory round trip', () => {
  it('returns [] when nothing has been saved yet', () => {
    const storage = new FakeStorage()
    expect(loadChatHistory(storage, 'alice')).toEqual([])
  })

  it('round-trips messages for one account', () => {
    const storage = new FakeStorage()
    const messages: ChatMessage[] = [
      { who: 'user', text: '老君可在？' },
      { who: 'npc', text: '贫道在此。' },
    ]
    saveChatHistory(storage, 'alice', messages)
    expect(loadChatHistory(storage, 'alice')).toEqual(messages)
  })

  it('keeps two accounts on the same storage isolated from each other', () => {
    const storage = new FakeStorage()
    saveChatHistory(storage, 'alice', [{ who: 'user', text: 'alice says hi' }])
    saveChatHistory(storage, 'bob', [{ who: 'user', text: 'bob says hi' }])
    expect(loadChatHistory(storage, 'alice')).toEqual([{ who: 'user', text: 'alice says hi' }])
    expect(loadChatHistory(storage, 'bob')).toEqual([{ who: 'user', text: 'bob says hi' }])
  })

  it('caps stored history at CHAT_HISTORY_LIMIT, keeping the most recent entries', () => {
    const storage = new FakeStorage()
    const messages: ChatMessage[] = Array.from({ length: CHAT_HISTORY_LIMIT + 10 }, (_, i) => ({
      who: i % 2 === 0 ? 'user' : 'npc',
      text: `msg-${i}`,
    }))
    saveChatHistory(storage, 'alice', messages)
    const loaded = loadChatHistory(storage, 'alice')
    expect(loaded).toHaveLength(CHAT_HISTORY_LIMIT)
    expect(loaded[0].text).toBe('msg-10')
    expect(loaded[loaded.length - 1].text).toBe(`msg-${CHAT_HISTORY_LIMIT + 9}`)
  })

  it('discards malformed stored data instead of throwing', () => {
    const storage = new FakeStorage()
    storage.setItem(chatHistoryKey('alice'), '{not json')
    expect(loadChatHistory(storage, 'alice')).toEqual([])

    storage.setItem(chatHistoryKey('bob'), JSON.stringify({ not: 'an array' }))
    expect(loadChatHistory(storage, 'bob')).toEqual([])
  })

  it('filters out entries that are not well-formed chat messages', () => {
    const storage = new FakeStorage()
    storage.setItem(
      chatHistoryKey('alice'),
      JSON.stringify([{ who: 'user', text: 'ok' }, { who: 'ghost', text: 'bad who' }, { who: 'npc' }, 'not-an-object']),
    )
    expect(loadChatHistory(storage, 'alice')).toEqual([{ who: 'user', text: 'ok' }])
  })
})
