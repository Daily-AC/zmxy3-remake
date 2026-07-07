export interface WorldEventRecord {
  kind: string;
  data?: Record<string, unknown>;
  at: number;
}

export interface ConversationTurn {
  role: "player" | "npc";
  text: string;
  at: number;
}

const WORLD_EVENT_CAPACITY = 30;
const HISTORY_CAPACITY_PER_NPC = 20;

/** World events are global (any NPC can be asked about them), kept as a
 * simple ring buffer capped at WORLD_EVENT_CAPACITY. */
const worldEvents: WorldEventRecord[] = [];

export function recordWorldEvent(kind: string, data?: Record<string, unknown>, at?: number): void {
  worldEvents.push({ kind, data, at: at ?? Date.now() });
  if (worldEvents.length > WORLD_EVENT_CAPACITY) {
    worldEvents.splice(0, worldEvents.length - WORLD_EVENT_CAPACITY);
  }
}

export function recentWorldEvents(limit = 10): WorldEventRecord[] {
  return worldEvents.slice(-limit);
}

/** Conversation history is per-NPC (each NPC remembers their own chats). */
const historyByNpc = new Map<string, ConversationTurn[]>();

export function pushHistory(npcId: string, turn: ConversationTurn): void {
  const list = historyByNpc.get(npcId) ?? [];
  list.push(turn);
  if (list.length > HISTORY_CAPACITY_PER_NPC) {
    list.splice(0, list.length - HISTORY_CAPACITY_PER_NPC);
  }
  historyByNpc.set(npcId, list);
}

export function getHistory(npcId: string): ConversationTurn[] {
  return historyByNpc.get(npcId) ?? [];
}
