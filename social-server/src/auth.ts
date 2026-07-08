import type { NextFunction, Request, RequestHandler, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import type { SocialDb } from "./db.js";
import type { PublicUser } from "./types.js";

export interface AuthedRequest extends Request {
  userId: string;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export type RegisterResult =
  | { ok: true; token: string; user: PublicUser }
  | { ok: false; reason: "invalid_input" | "username_taken" };

export type LoginResult =
  | { ok: true; token: string; user: PublicUser }
  | { ok: false; reason: "invalid_input" | "invalid_credentials" };

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCredential(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPublicUser(row: Pick<UserRow, "id" | "username">): PublicUser {
  return { id: String(row.id), username: row.username };
}

export function assertJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is required");
  return secret;
}

export function getUserById(db: SocialDb, userId: string): PublicUser | null {
  const row = db.prepare("SELECT id, username FROM users WHERE id = ?").get(Number(userId)) as
    | Pick<UserRow, "id" | "username">
    | undefined;
  return row ? toPublicUser(row) : null;
}

function signToken(user: PublicUser): string {
  return jwt.sign({ sub: user.id, username: user.username }, assertJwtSecret(), {
    expiresIn: "7d",
  });
}

export function registerUser(db: SocialDb, usernameInput: unknown, passwordInput: unknown): RegisterResult {
  const username = normalizeCredential(usernameInput);
  const password = normalizeCredential(passwordInput);
  if (!username || !password) return { ok: false, reason: "invalid_input" };

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const inserted = db
      .prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run(username, passwordHash, nowIso());
    const user: PublicUser = { id: String(inserted.lastInsertRowid), username };
    return { ok: true, token: signToken(user), user };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { ok: false, reason: "username_taken" };
    }
    throw error;
  }
}

export function loginUser(db: SocialDb, usernameInput: unknown, passwordInput: unknown): LoginResult {
  const username = normalizeCredential(usernameInput);
  const password = normalizeCredential(passwordInput);
  if (!username || !password) return { ok: false, reason: "invalid_input" };

  const row = db.prepare("SELECT id, username, password_hash, created_at FROM users WHERE username = ?").get(username) as
    | UserRow
    | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const user = toPublicUser(row);
  return { ok: true, token: signToken(user), user };
}

export function verifyToken(db: SocialDb, token: string): PublicUser | null {
  try {
    const payload = jwt.verify(token, assertJwtSecret()) as JwtPayload | string;
    if (typeof payload === "string" || typeof payload.sub !== "string") return null;
    return getUserById(db, payload.sub);
  } catch {
    return null;
  }
}

export function createRequireAuth(db: SocialDb): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
    if (!token) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const user = verifyToken(db, token);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    (req as AuthedRequest).userId = user.id;
    next();
  };
}
