// Per-account persistence for the 太上老君 chat drawer (FurnaceRecipeView.ts).
// One storage entry per username so two accounts on the same browser don't
// see each other's chat log; caps at CHAT_HISTORY_LIMIT entries so the
// stored blob can't grow unbounded across a long session.
//
// Pure logic, no DOM: storage is an injected `ChatHistoryStorage`
// (`window.localStorage` at runtime, an in-memory stub in tests) -- same
// dependency-injection style as systems/save.ts's `SaveStorage` (`window`
// doesn't exist in this project's node-based vitest environment, see that
// file's header).

export interface ChatMessage {
  who: 'user' | 'npc'
  text: string
}

export type ChatHistoryStorage = Pick<Storage, 'getItem' | 'setItem'>

export const CHAT_HISTORY_LIMIT = 50

const KEY_PREFIX = 'zmxy.laojun.chat.'

export function chatHistoryKey(username: string): string {
  return `${KEY_PREFIX}${username && username.length > 0 ? username : 'guest'}`
}

export function loadChatHistory(storage: ChatHistoryStorage, username: string): ChatMessage[] {
  try {
    const raw = storage.getItem(chatHistoryKey(username))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isChatMessage).slice(-CHAT_HISTORY_LIMIT)
  } catch {
    return []
  }
}

export function saveChatHistory(storage: ChatHistoryStorage, username: string, messages: ChatMessage[]): void {
  try {
    storage.setItem(chatHistoryKey(username), JSON.stringify(messages.slice(-CHAT_HISTORY_LIMIT)))
  } catch {
    // Storage full/disabled (private mode, quota) -- chat still works in-memory for the rest of this session.
  }
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false
  const v = value as { who?: unknown; text?: unknown }
  return (v.who === 'user' || v.who === 'npc') && typeof v.text === 'string'
}
