import { randomUUID } from "node:crypto";
import type { LevelId } from "./types.js";
import type { RoomSnapshot } from "./ws-protocol.js";

// Rooms are deliberately in-memory, ephemeral lobby state. They reset on server
// restart, which is acceptable for this MVP. In-combat real-time sync is not
// implemented here by design: the pre-decided architecture is
// room-owner-authority plus WebSocket broadcasts for lobby-only events.

export interface RoomMember {
  userId: string;
  username: string;
  ready: boolean;
}

export interface Room {
  id: string;
  levelId: LevelId;
  ownerId: string;
  members: RoomMember[];
  status: "waiting" | "in_game";
  createdAt: number;
}

export const ROOM_CAPACITY = 4;

export function createRoom(id: string, levelId: LevelId, owner: RoomMember): Room {
  return {
    id,
    levelId,
    ownerId: owner.userId,
    members: [{ ...owner }],
    status: "waiting",
    createdAt: Date.now(),
  };
}

export type JoinResult =
  | { ok: true; room: Room }
  | { ok: false; reason: "full" | "in_game" | "already_member" | "not_found" };

export function joinRoom(room: Room, member: RoomMember): JoinResult {
  if (room.members.some((existing) => existing.userId === member.userId)) {
    return { ok: false, reason: "already_member" };
  }
  if (room.status === "in_game") return { ok: false, reason: "in_game" };
  if (room.members.length >= ROOM_CAPACITY) return { ok: false, reason: "full" };
  return { ok: true, room: { ...room, members: [...room.members, { ...member }] } };
}

// Returns null when the room should be disbanded because the last member left.
// If the owner leaves while others remain, ownership transfers to the earliest
// joined remaining member (members array order is join order).
export function leaveRoom(room: Room, userId: string): Room | null {
  const members = room.members.filter((member) => member.userId !== userId);
  if (members.length === room.members.length) return { ...room, members: [...room.members] };
  if (members.length === 0) return null;
  return {
    ...room,
    ownerId: room.ownerId === userId ? members[0].userId : room.ownerId,
    members,
  };
}

export function setReady(room: Room, userId: string, ready: boolean): Room {
  return {
    ...room,
    members: room.members.map((member) => (member.userId === userId ? { ...member, ready } : { ...member })),
  };
}

export function canStart(room: Room): boolean {
  return room.status === "waiting" && room.members.length >= 1 && room.members.every((member) => member.ready);
}

// startGame throws if called before canStart(room) is true. Callers such as the
// WS layer gate this first so user-facing failures can be returned as protocol
// errors instead of uncaught exceptions.
export function startGame(room: Room): Room {
  if (!canStart(room)) throw new Error("cannot start room before all members are ready");
  return { ...room, status: "in_game" };
}

export function toRoomSnapshot(room: Room): RoomSnapshot {
  return {
    id: room.id,
    levelId: room.levelId,
    ownerId: room.ownerId,
    status: room.status,
    members: room.members.map((member) => ({ ...member })),
  };
}

export function isLevelId(value: unknown): value is LevelId {
  return value === "L1" || value === "L2";
}

export type LeaveResult =
  | { ok: true; room: Room | null; previousRoom: Room; leftUserId: string; newOwnerId?: string }
  | { ok: false; reason: "not_found" | "not_member" };

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  create(levelId: LevelId, owner: Omit<RoomMember, "ready"> & { ready?: boolean }): Room {
    const room = createRoom(randomUUID().slice(0, 8), levelId, {
      userId: owner.userId,
      username: owner.username,
      ready: owner.ready ?? false,
    });
    this.rooms.set(room.id, room);
    return room;
  }

  join(roomId: string, member: Omit<RoomMember, "ready"> & { ready?: boolean }): JoinResult {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, reason: "not_found" };
    const result = joinRoom(room, {
      userId: member.userId,
      username: member.username,
      ready: member.ready ?? false,
    });
    if (result.ok) this.rooms.set(roomId, result.room);
    return result;
  }

  leave(roomId: string, userId: string): LeaveResult {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, reason: "not_found" };
    if (!room.members.some((member) => member.userId === userId)) {
      return { ok: false, reason: "not_member" };
    }
    const next = leaveRoom(room, userId);
    if (next) {
      this.rooms.set(roomId, next);
    } else {
      this.rooms.delete(roomId);
    }
    const newOwnerId = next && room.ownerId !== next.ownerId ? next.ownerId : undefined;
    return { ok: true, room: next, previousRoom: room, leftUserId: userId, newOwnerId };
  }

  setReady(roomId: string, userId: string, ready: boolean): Room | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.members.some((member) => member.userId === userId)) return null;
    const next = setReady(room, userId, ready);
    this.rooms.set(roomId, next);
    return next;
  }

  start(roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const next = startGame(room);
    this.rooms.set(roomId, next);
    return next;
  }

  get(roomId: string): Room | null {
    return this.rooms.get(roomId) ?? null;
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }
}
