import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export type SocialDb = Database.Database;

interface Migration {
  version: number;
  up: (db: SocialDb) => void;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = path.resolve(__dirname, "../data/social.db");

const migrations: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE friend_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_user_id INTEGER NOT NULL REFERENCES users(id),
          to_user_id INTEGER NOT NULL REFERENCES users(id),
          status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE friendships (
          user_id_a INTEGER NOT NULL REFERENCES users(id),
          user_id_b INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id_a, user_id_b)
        );
      `);
    },
  },
];

function ensureDbDirectory(dbPath: string): void {
  if (dbPath === ":memory:") return;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

export function runMigrations(db: SocialDb): void {
  // Versioned SQL DDL migrations: each step runs once when schema_meta.version
  // is below the migration's version, then updates schema_meta in the same tx.
  db.exec("CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);");
  const current = db.prepare("SELECT version FROM schema_meta LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (!current) {
    db.prepare("INSERT INTO schema_meta (version) VALUES (0)").run();
  }

  let version = current?.version ?? 0;
  for (const migration of migrations) {
    if (version >= migration.version) continue;
    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare("UPDATE schema_meta SET version = ?").run(migration.version);
    });
    apply();
    version = migration.version;
  }
}

export function openSocialDb(dbPath = process.env.SOCIAL_DB_PATH ?? DEFAULT_DB_PATH): SocialDb {
  ensureDbDirectory(dbPath);
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}
