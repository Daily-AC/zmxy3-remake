import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROOM_CAPACITY,
  canStart,
  createRoom,
  joinRoom,
  leaveRoom,
  setReady,
  startGame,
  type Room,
  type RoomMember,
} from "../src/rooms.js";

function member(userId: string, ready = false): RoomMember {
  return { userId, username: userId.toUpperCase(), ready };
}

function waitingRoom(members: RoomMember[] = [member("owner")]): Room {
  return {
    id: "room-1",
    levelId: "L1",
    ownerId: members[0].userId,
    members,
    status: "waiting",
    createdAt: 123,
  };
}

test("createRoom creates a waiting room owned by the first member", () => {
  const room = createRoom("room-1", "L2", member("alice"));
  assert.equal(room.id, "room-1");
  assert.equal(room.levelId, "L2");
  assert.equal(room.ownerId, "alice");
  assert.equal(room.status, "waiting");
  assert.deepEqual(room.members, [member("alice")]);
});

test("joinRoom adds a new member when the room is waiting and has capacity", () => {
  const result = joinRoom(waitingRoom(), member("bob"));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.room.members.map((m) => m.userId), ["owner", "bob"]);
  }
});

test("joinRoom rejects a full room", () => {
  const full = waitingRoom(Array.from({ length: ROOM_CAPACITY }, (_, i) => member(`u${i}`)));
  assert.deepEqual(joinRoom(full, member("extra")), { ok: false, reason: "full" });
});

test("joinRoom rejects rooms already in game", () => {
  const room = { ...waitingRoom(), status: "in_game" as const };
  assert.deepEqual(joinRoom(room, member("bob")), { ok: false, reason: "in_game" });
});

test("joinRoom rejects duplicate members", () => {
  assert.deepEqual(joinRoom(waitingRoom([member("owner"), member("bob")]), member("bob")), {
    ok: false,
    reason: "already_member",
  });
});

test("leaveRoom removes a non-owner while keeping the owner", () => {
  const room = waitingRoom([member("owner"), member("bob"), member("cara")]);
  const next = leaveRoom(room, "bob");
  assert.notEqual(next, null);
  assert.equal(next!.ownerId, "owner");
  assert.deepEqual(next!.members.map((m) => m.userId), ["owner", "cara"]);
});

test("leaveRoom transfers ownership to the earliest remaining member when owner leaves", () => {
  const room = waitingRoom([member("owner"), member("bob"), member("cara")]);
  const next = leaveRoom(room, "owner");
  assert.notEqual(next, null);
  assert.equal(next!.ownerId, "bob");
  assert.deepEqual(next!.members.map((m) => m.userId), ["bob", "cara"]);
});

test("leaveRoom returns null when the last member leaves", () => {
  assert.equal(leaveRoom(waitingRoom([member("owner")]), "owner"), null);
});

test("setReady toggles one member without mutating the original room", () => {
  const room = waitingRoom([member("owner"), member("bob")]);
  const next = setReady(room, "bob", true);
  assert.equal(room.members[1].ready, false);
  assert.equal(next.members[1].ready, true);
  assert.equal(setReady(next, "bob", false).members[1].ready, false);
});

test("canStart is false until every member is ready and the room is waiting", () => {
  const notReady = waitingRoom([member("owner", true), member("bob", false)]);
  assert.equal(canStart(notReady), false);
  const ready = setReady(notReady, "bob", true);
  assert.equal(canStart(ready), true);
  assert.equal(canStart({ ...ready, status: "in_game" }), false);
});

test("solo room can start once the owner is ready", () => {
  assert.equal(canStart(waitingRoom([member("owner", false)])), false);
  assert.equal(canStart(waitingRoom([member("owner", true)])), true);
});

test("startGame sets status to in_game and throws when canStart is false", () => {
  assert.throws(() => startGame(waitingRoom([member("owner", false)])), /cannot start/);
  const started = startGame(waitingRoom([member("owner", true)]));
  assert.equal(started.status, "in_game");
});
