import type { SocialDb } from "./db.js";
import type { PublicUser } from "./types.js";

export type FriendRequestStatus = "pending" | "accepted" | "rejected";

export interface FriendRequestRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
}

export type SendRequestResult =
  | { ok: true }
  | { ok: false; reason: "self" | "already_friends" | "duplicate_pending" };

export function canSendFriendRequest(
  existingRequests: FriendRequestRecord[],
  areFriends: boolean,
  fromUserId: string,
  toUserId: string,
): SendRequestResult {
  if (fromUserId === toUserId) return { ok: false, reason: "self" };
  if (areFriends) return { ok: false, reason: "already_friends" };

  const duplicatePending = existingRequests.some((request) => {
    if (request.status !== "pending") return false;
    return (
      (request.fromUserId === fromUserId && request.toUserId === toUserId) ||
      (request.fromUserId === toUserId && request.toUserId === fromUserId)
    );
  });
  if (duplicatePending) return { ok: false, reason: "duplicate_pending" };

  return { ok: true };
}

export type RespondResult =
  | { ok: true; request: FriendRequestRecord }
  | { ok: false; reason: "not_pending" | "not_recipient" };

function respondToRequest(
  request: FriendRequestRecord,
  respondingUserId: string,
  status: "accepted" | "rejected",
): RespondResult {
  if (request.status !== "pending") return { ok: false, reason: "not_pending" };
  if (request.toUserId !== respondingUserId) return { ok: false, reason: "not_recipient" };
  return { ok: true, request: { ...request, status } };
}

export function acceptFriendRequest(request: FriendRequestRecord, respondingUserId: string): RespondResult {
  return respondToRequest(request, respondingUserId, "accepted");
}

export function rejectFriendRequest(request: FriendRequestRecord, respondingUserId: string): RespondResult {
  return respondToRequest(request, respondingUserId, "rejected");
}

export function friendshipPair(userId: string, otherUserId: string): { userIdA: string; userIdB: string } {
  return userId < otherUserId
    ? { userIdA: userId, userIdB: otherUserId }
    : { userIdA: otherUserId, userIdB: userId };
}

export function removeFriendshipPair(userId: string, otherUserId: string): { userIdA: string; userIdB: string } {
  return friendshipPair(userId, otherUserId);
}

// ---------- DB-backed repository layer ----------
//
// The SQL layer is intentionally thin: it gathers the current DB state, calls
// the pure state-machine helpers above for decisions, then applies the write.

interface UserRow {
  id: number;
  username: string;
}

interface FriendRequestRow {
  id: number;
  from_user_id: number;
  to_user_id: number;
  status: FriendRequestStatus;
  created_at: string;
  updated_at: string;
}

interface FriendRequestJoinRow extends FriendRequestRow {
  from_username: string;
  to_username: string;
}

export interface FriendRequestView {
  id: string;
  fromUser: PublicUser;
  toUser: PublicUser;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FriendsList {
  friends: PublicUser[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
}

export type SendFriendRequestRepoResult =
  | { ok: true; request: FriendRequestView }
  | {
      ok: false;
      reason: "to_user_not_found" | "self" | "already_friends" | "duplicate_pending";
    };

export type RespondToFriendRequestRepoResult =
  | { ok: true; request: FriendRequestView }
  | { ok: false; reason: "request_not_found" | "not_pending" | "not_recipient" };

function nowIso(): string {
  return new Date().toISOString();
}

function asPublicUser(row: UserRow): PublicUser {
  return { id: String(row.id), username: row.username };
}

function rowToRecord(row: FriendRequestRow): FriendRequestRecord {
  return {
    id: String(row.id),
    fromUserId: String(row.from_user_id),
    toUserId: String(row.to_user_id),
    status: row.status,
  };
}

function rowToView(row: FriendRequestJoinRow): FriendRequestView {
  return {
    id: String(row.id),
    fromUser: { id: String(row.from_user_id), username: row.from_username },
    toUser: { id: String(row.to_user_id), username: row.to_username },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function orderedNumericPair(userId: string, otherUserId: string): { a: number; b: number } {
  const a = Number(userId);
  const b = Number(otherUserId);
  return a < b ? { a, b } : { a: b, b: a };
}

export function areUsersFriends(db: SocialDb, userId: string, otherUserId: string): boolean {
  const pair = orderedNumericPair(userId, otherUserId);
  const row = db
    .prepare("SELECT 1 FROM friendships WHERE user_id_a = ? AND user_id_b = ?")
    .get(pair.a, pair.b) as { "1": number } | undefined;
  return row !== undefined;
}

function getUserByUsername(db: SocialDb, username: string): UserRow | null {
  const row = db.prepare("SELECT id, username FROM users WHERE username = ?").get(username) as UserRow | undefined;
  return row ?? null;
}

function getRequestWithUsers(db: SocialDb, requestId: string): FriendRequestView | null {
  const row = db
    .prepare(
      `
      SELECT
        fr.id,
        fr.from_user_id,
        fr.to_user_id,
        fr.status,
        fr.created_at,
        fr.updated_at,
        from_user.username AS from_username,
        to_user.username AS to_username
      FROM friend_requests fr
      JOIN users from_user ON from_user.id = fr.from_user_id
      JOIN users to_user ON to_user.id = fr.to_user_id
      WHERE fr.id = ?
    `,
    )
    .get(Number(requestId)) as FriendRequestJoinRow | undefined;
  return row ? rowToView(row) : null;
}

function pendingRequestsBetween(db: SocialDb, fromUserId: string, toUserId: string): FriendRequestRecord[] {
  const rows = db
    .prepare(
      `
      SELECT id, from_user_id, to_user_id, status, created_at, updated_at
      FROM friend_requests
      WHERE status = 'pending'
        AND (
          (from_user_id = ? AND to_user_id = ?)
          OR (from_user_id = ? AND to_user_id = ?)
        )
    `,
    )
    .all(Number(fromUserId), Number(toUserId), Number(toUserId), Number(fromUserId)) as FriendRequestRow[];
  return rows.map(rowToRecord);
}

export function sendFriendRequest(
  db: SocialDb,
  fromUserId: string,
  toUsername: unknown,
): SendFriendRequestRepoResult {
  if (typeof toUsername !== "string" || toUsername.trim().length === 0) {
    return { ok: false, reason: "to_user_not_found" };
  }

  const toUser = getUserByUsername(db, toUsername.trim());
  if (!toUser) return { ok: false, reason: "to_user_not_found" };

  const toUserId = String(toUser.id);
  const decision = canSendFriendRequest(
    pendingRequestsBetween(db, fromUserId, toUserId),
    areUsersFriends(db, fromUserId, toUserId),
    fromUserId,
    toUserId,
  );
  if (!decision.ok) return decision;

  const now = nowIso();
  const inserted = db
    .prepare(
      `
      INSERT INTO friend_requests (from_user_id, to_user_id, status, created_at, updated_at)
      VALUES (?, ?, 'pending', ?, ?)
    `,
    )
    .run(Number(fromUserId), toUser.id, now, now);
  const request = getRequestWithUsers(db, String(inserted.lastInsertRowid));
  if (!request) throw new Error("failed to load inserted friend request");
  return { ok: true, request };
}

export function respondToFriendRequest(
  db: SocialDb,
  requestId: string,
  respondingUserId: string,
  accept: boolean,
): RespondToFriendRequestRepoResult {
  const row = db
    .prepare("SELECT id, from_user_id, to_user_id, status, created_at, updated_at FROM friend_requests WHERE id = ?")
    .get(Number(requestId)) as FriendRequestRow | undefined;
  if (!row) return { ok: false, reason: "request_not_found" };

  const record = rowToRecord(row);
  const decision = accept
    ? acceptFriendRequest(record, respondingUserId)
    : rejectFriendRequest(record, respondingUserId);
  if (!decision.ok) return decision;

  const apply = db.transaction(() => {
    db.prepare("UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ?").run(
      decision.request.status,
      nowIso(),
      Number(requestId),
    );
    if (decision.request.status === "accepted") {
      const pair = orderedNumericPair(decision.request.fromUserId, decision.request.toUserId);
      db.prepare("INSERT OR IGNORE INTO friendships (user_id_a, user_id_b, created_at) VALUES (?, ?, ?)").run(
        pair.a,
        pair.b,
        nowIso(),
      );
    }
  });
  apply();

  const request = getRequestWithUsers(db, requestId);
  if (!request) throw new Error("failed to load updated friend request");
  return { ok: true, request };
}

export function removeFriend(db: SocialDb, userId: string, otherUserId: string): boolean {
  const pair = orderedNumericPair(userId, otherUserId);
  const result = db
    .prepare("DELETE FROM friendships WHERE user_id_a = ? AND user_id_b = ?")
    .run(pair.a, pair.b);
  return result.changes > 0;
}

export function listFriends(db: SocialDb, userId: string): FriendsList {
  const id = Number(userId);
  const friends = db
    .prepare(
      `
      SELECT u.id, u.username
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.user_id_a = ? THEN f.user_id_b ELSE f.user_id_a END
      WHERE f.user_id_a = ? OR f.user_id_b = ?
      ORDER BY u.username
    `,
    )
    .all(id, id, id) as UserRow[];

  const requestSql = `
    SELECT
      fr.id,
      fr.from_user_id,
      fr.to_user_id,
      fr.status,
      fr.created_at,
      fr.updated_at,
      from_user.username AS from_username,
      to_user.username AS to_username
    FROM friend_requests fr
    JOIN users from_user ON from_user.id = fr.from_user_id
    JOIN users to_user ON to_user.id = fr.to_user_id
    WHERE fr.status = 'pending' AND __COLUMN__ = ?
    ORDER BY fr.created_at
  `;

  const incoming = db
    .prepare(requestSql.replace("__COLUMN__", "fr.to_user_id"))
    .all(id) as FriendRequestJoinRow[];
  const outgoing = db
    .prepare(requestSql.replace("__COLUMN__", "fr.from_user_id"))
    .all(id) as FriendRequestJoinRow[];

  return {
    friends: friends.map(asPublicUser),
    incoming: incoming.map(rowToView),
    outgoing: outgoing.map(rowToView),
  };
}
