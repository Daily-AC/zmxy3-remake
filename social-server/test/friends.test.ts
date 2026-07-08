import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptFriendRequest,
  canSendFriendRequest,
  friendshipPair,
  rejectFriendRequest,
  removeFriendshipPair,
  type FriendRequestRecord,
} from "../src/friends.js";

function request(overrides: Partial<FriendRequestRecord> = {}): FriendRequestRecord {
  return {
    id: "req-1",
    fromUserId: "alice",
    toUserId: "bob",
    status: "pending",
    ...overrides,
  };
}

test("canSendFriendRequest rejects self requests", () => {
  assert.deepEqual(canSendFriendRequest([], false, "alice", "alice"), {
    ok: false,
    reason: "self",
  });
});

test("canSendFriendRequest rejects users that are already friends", () => {
  assert.deepEqual(canSendFriendRequest([], true, "alice", "bob"), {
    ok: false,
    reason: "already_friends",
  });
});

test("canSendFriendRequest rejects duplicate pending requests in either direction", () => {
  assert.deepEqual(canSendFriendRequest([request()], false, "alice", "bob"), {
    ok: false,
    reason: "duplicate_pending",
  });
  assert.deepEqual(canSendFriendRequest([request()], false, "bob", "alice"), {
    ok: false,
    reason: "duplicate_pending",
  });
});

test("canSendFriendRequest allows a new request when only settled old requests exist", () => {
  assert.deepEqual(canSendFriendRequest([request({ status: "rejected" })], false, "alice", "bob"), {
    ok: true,
  });
});

test("acceptFriendRequest only works on pending requests by the recipient", () => {
  assert.deepEqual(acceptFriendRequest(request(), "alice"), {
    ok: false,
    reason: "not_recipient",
  });

  const accepted = acceptFriendRequest(request(), "bob");
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.request.status, "accepted");
  }
});

test("rejectFriendRequest only works on pending requests by the recipient", () => {
  assert.deepEqual(rejectFriendRequest(request(), "alice"), {
    ok: false,
    reason: "not_recipient",
  });

  const rejected = rejectFriendRequest(request(), "bob");
  assert.equal(rejected.ok, true);
  if (rejected.ok) {
    assert.equal(rejected.request.status, "rejected");
  }
});

test("accepting or rejecting an already-settled request is rejected as not_pending", () => {
  assert.deepEqual(acceptFriendRequest(request({ status: "accepted" }), "bob"), {
    ok: false,
    reason: "not_pending",
  });
  assert.deepEqual(rejectFriendRequest(request({ status: "rejected" }), "bob"), {
    ok: false,
    reason: "not_pending",
  });
});

test("friendshipPair documents the stable pair-removal contract", () => {
  assert.deepEqual(friendshipPair("9", "2"), { userIdA: "2", userIdB: "9" });
  assert.deepEqual(removeFriendshipPair("alice", "bob"), { userIdA: "alice", userIdB: "bob" });
});
