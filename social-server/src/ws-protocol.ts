import type { LevelId } from "./types.js";

export interface RoomSnapshot {
  id: string;
  levelId: LevelId;
  ownerId: string;
  status: "waiting" | "in_game";
  members: Array<{ userId: string; username: string; ready: boolean }>;
}

export type ClientToServerMessage =
  | { type: "join"; token: string; roomId: string }
  | { type: "ready"; ready: boolean }
  | { type: "leave" }
  | { type: "start" };

export type ServerToClientMessage =
  | { type: "room_state"; room: RoomSnapshot }
  // Broadcast when a socket successfully subscribes to the room, not when REST
  // membership is created. This deliberately ties presence to connected clients
  // and avoids showing phantom online members who joined via REST only.
  | { type: "member_joined"; member: { userId: string; username: string } }
  | { type: "member_left"; userId: string; newOwnerId?: string }
  | { type: "ready_changed"; userId: string; ready: boolean }
  | { type: "game_start"; levelId: LevelId }
  | { type: "error"; message: string };
