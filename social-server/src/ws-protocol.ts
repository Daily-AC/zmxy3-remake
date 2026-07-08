import type { LevelId } from "./types.js";

export interface RoomSnapshot {
  id: string;
  levelId: LevelId;
  ownerId: string;
  status: "waiting" | "in_game";
  members: Array<{ userId: string; username: string; ready: boolean }>;
}

// ---------- future combat-sync message shapes (protocol-only) ----------
//
// Performance target (2026-07-08 用户拍板): 10 人同房不卡. The architecture
// stays room-owner-authority + WS fanout at this scale: this server never
// simulates or arbitrates anything, it only relays. These two shapes are the
// *only* thing this brief asks for here -- designing the wire format so the
// next 棒 (actual combat sync) has somewhere to plug in. ws-server.ts's
// handleState/handleEvent do nothing but relay verbatim to the rest of the
// room; there is no authority check on who may send one (deciding e.g.
// "only the room owner may send state" is a gameplay policy call that
// belongs to that future work, not this lobby-routing layer).
//
// Sync is split into two frequency tiers with different reliability
// contracts, both riding the same reliable/ordered WebSocket transport:
//
// - StateMessage: high-frequency (10-20Hz) position/action snapshots.
//   Carries a monotonic `seq`. Receivers must apply "unreliable channel"
//   semantics on top of the reliable transport: discard any `state` whose
//   `seq` is <= the highest `seq` already accepted from that sender, exactly
//   as if it had been dropped by the network. Stale position data is worse
//   than useless once a newer sample exists, so this is a deliberate
//   last-write-wins policy, not a transport limitation.
// - EventMessage: low-frequency, must-not-drop occurrences (damage/pickup/
//   drop/etc). No `seq` needed -- plain TCP/WS ordering is sufficient
//   because these are rare and every one of them matters.
//
// Wire format starts as plain JSON like everything else here; if the fanout
// load test (test/loadtest-fanout.ts) ever shows JSON overhead blowing the
// latency budget at real player counts, that's the trigger to revisit a
// binary encoding -- not before.

export interface StateMessage {
  type: "state";
  seq: number;
  payload: unknown;
  /** Sender's Date.now() at send time, for end-to-end latency measurement. */
  sentAt: number;
}

export interface EventMessage {
  type: "event";
  name: string;
  payload: unknown;
}

export type ClientToServerMessage =
  | { type: "join"; token: string; roomId: string }
  | { type: "ready"; ready: boolean }
  | { type: "leave" }
  | { type: "start" }
  | StateMessage
  | EventMessage;

export type ServerToClientMessage =
  | { type: "room_state"; room: RoomSnapshot }
  // Broadcast when a socket successfully subscribes to the room, not when REST
  // membership is created. This deliberately ties presence to connected clients
  // and avoids showing phantom online members who joined via REST only.
  | { type: "member_joined"; member: { userId: string; username: string } }
  | { type: "member_left"; userId: string; newOwnerId?: string }
  | { type: "ready_changed"; userId: string; ready: boolean }
  | { type: "game_start"; levelId: LevelId }
  | { type: "error"; message: string }
  | (StateMessage & { fromUserId: string })
  | (EventMessage & { fromUserId: string });
