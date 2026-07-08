import { test } from "node:test";
import assert from "node:assert/strict";
import { assertJwtSecret, loginUser, registerUser, verifyToken } from "../src/auth.js";
import { openSocialDb } from "../src/db.js";

process.env.JWT_SECRET = "unit-test-secret";

test("registerUser creates a DB-backed user and token that verifyToken can resolve", () => {
  const db = openSocialDb(":memory:");
  try {
    const registered = registerUser(db, "alice", "secret");
    assert.equal(registered.ok, true);
    if (!registered.ok) return;

    assert.equal(registered.user.username, "alice");
    assert.equal(typeof registered.token, "string");

    const verified = verifyToken(db, registered.token);
    assert.deepEqual(verified, registered.user);
  } finally {
    db.close();
  }
});

test("registerUser rejects empty credentials and duplicate usernames", () => {
  const db = openSocialDb(":memory:");
  try {
    assert.deepEqual(registerUser(db, "", "secret"), { ok: false, reason: "invalid_input" });
    assert.deepEqual(registerUser(db, "alice", ""), { ok: false, reason: "invalid_input" });

    assert.equal(registerUser(db, "alice", "secret").ok, true);
    assert.deepEqual(registerUser(db, "alice", "another"), {
      ok: false,
      reason: "username_taken",
    });
  } finally {
    db.close();
  }
});

test("loginUser returns the same public user shape and hides which credential was wrong", () => {
  const db = openSocialDb(":memory:");
  try {
    const registered = registerUser(db, "alice", "secret");
    assert.equal(registered.ok, true);

    const loggedIn = loginUser(db, "alice", "secret");
    assert.equal(loggedIn.ok, true);
    if (loggedIn.ok && registered.ok) {
      assert.deepEqual(loggedIn.user, registered.user);
      assert.deepEqual(verifyToken(db, loggedIn.token), registered.user);
    }

    assert.deepEqual(loginUser(db, "alice", "wrong"), {
      ok: false,
      reason: "invalid_credentials",
    });
    assert.deepEqual(loginUser(db, "missing", "secret"), {
      ok: false,
      reason: "invalid_credentials",
    });
  } finally {
    db.close();
  }
});

test("assertJwtSecret throws a clear startup error when JWT_SECRET is missing", () => {
  const original = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    assert.throws(() => assertJwtSecret(), /JWT_SECRET env var is required/);
  } finally {
    process.env.JWT_SECRET = original;
  }
});
