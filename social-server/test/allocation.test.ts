import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceOf,
  commitTransfer,
  createLedger,
  credit,
  lockTransfer,
  refundTransfer,
  rollDropsForPresent,
  splitAmongPresent,
  transferItem,
} from "../src/allocation.js";

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function ledgerWithAlice(qty = 3) {
  const ledger = createLedger();
  credit(ledger, "alice", "ore", qty);
  return ledger;
}

test("splitAmongPresent divides evenly when there is no remainder", () => {
  assert.deepEqual(splitAmongPresent(12, ["alice", "bob", "cara"], "bob"), [
    { userId: "alice", amount: 4 },
    { userId: "bob", amount: 4 },
    { userId: "cara", amount: 4 },
  ]);
});

test("splitAmongPresent assigns the remainder to the killer for two, three, and four present users", () => {
  assert.deepEqual(splitAmongPresent(5, ["alice", "bob"], "bob"), [
    { userId: "alice", amount: 2 },
    { userId: "bob", amount: 3 },
  ]);
  assert.deepEqual(splitAmongPresent(10, ["alice", "bob", "cara"], "alice"), [
    { userId: "alice", amount: 4 },
    { userId: "bob", amount: 3 },
    { userId: "cara", amount: 3 },
  ]);
  assert.deepEqual(splitAmongPresent(11, ["alice", "bob", "cara", "dan"], "cara"), [
    { userId: "alice", amount: 2 },
    { userId: "bob", amount: 2 },
    { userId: "cara", amount: 5 },
    { userId: "dan", amount: 2 },
  ]);
});

test("splitAmongPresent gives a single present member everything", () => {
  assert.deepEqual(splitAmongPresent(7, ["alice"], "alice"), [{ userId: "alice", amount: 7 }]);
});

test("splitAmongPresent throws when the killer is not present", () => {
  assert.throws(() => splitAmongPresent(7, ["alice"], "bob"), /killerUserId must be present/);
});

test("rollDropsForPresent gives chance-1 drops to everyone and chance-0 drops to nobody", () => {
  assert.deepEqual(
    rollDropsForPresent(
      [
        { itemId: "guaranteed", chance: 1 },
        { itemId: "never", chance: 0 },
      ],
      ["alice", "bob"],
      () => 0.25,
    ),
    [
      { userId: "alice", itemId: "guaranteed" },
      { userId: "bob", itemId: "guaranteed" },
    ],
  );
});

test("rollDropsForPresent rolls independently per player instead of sharing one contested result", () => {
  const rng = mulberry32(12345);
  const seen = new Set<string>();

  for (let i = 0; i < 2000; i += 1) {
    const rolls = rollDropsForPresent([{ itemId: "gem", chance: 0.5 }], ["alice", "bob"], rng);
    const users = new Set(rolls.map((roll) => roll.userId));
    seen.add(`${users.has("alice") ? "A" : "-"}${users.has("bob") ? "B" : "-"}`);
  }

  assert.deepEqual(new Set(["AB", "A-", "-B", "--"]), seen);
});

test("lockTransfer deducts immediately under a pending transaction", () => {
  const ledger = ledgerWithAlice();
  const tx = lockTransfer(ledger, "tx-1", "alice", "ore", 2);
  assert.notEqual(tx, null);
  assert.equal(tx!.status, "pending");
  assert.equal(balanceOf(ledger, "alice", "ore"), 1);
});

test("lockTransfer refuses when balance is insufficient and leaves the ledger untouched", () => {
  const ledger = ledgerWithAlice();
  const tx = lockTransfer(ledger, "tx-2", "alice", "ore", 99);
  assert.equal(tx, null);
  assert.equal(balanceOf(ledger, "alice", "ore"), 3);
});

test("commitTransfer finalizes a successful transfer and credits the receiver", () => {
  const ledger = ledgerWithAlice();
  const tx = lockTransfer(ledger, "tx-3", "alice", "ore", 2)!;
  tx.toUserId = "bob";
  assert.equal(commitTransfer(ledger, tx), true);
  assert.equal(tx.status, "committed");
  assert.equal(balanceOf(ledger, "alice", "ore"), 1);
  assert.equal(balanceOf(ledger, "bob", "ore"), 2);
});

test("refundTransfer restores the sender after a failed transfer", () => {
  const ledger = ledgerWithAlice();
  const tx = lockTransfer(ledger, "tx-4", "alice", "ore", 2)!;
  assert.equal(balanceOf(ledger, "alice", "ore"), 1);
  assert.equal(refundTransfer(ledger, tx), true);
  assert.equal(tx.status, "refunded");
  assert.equal(balanceOf(ledger, "alice", "ore"), 3);
});

test("commit and refund are idempotent and mutually exclusive on a settled tx", () => {
  const ledger = ledgerWithAlice();
  const tx = lockTransfer(ledger, "tx-5", "alice", "ore", 2)!;
  tx.toUserId = "bob";
  assert.equal(commitTransfer(ledger, tx), true);
  // A late timeout after success must not double-refund.
  assert.equal(refundTransfer(ledger, tx), false);
  assert.equal(balanceOf(ledger, "alice", "ore"), 1);
  assert.equal(balanceOf(ledger, "bob", "ore"), 2);
  // And a second commit is a no-op too.
  assert.equal(commitTransfer(ledger, tx), false);
});

test("refund and commit are idempotent and mutually exclusive on a refunded tx", () => {
  const ledger = ledgerWithAlice();
  const tx = lockTransfer(ledger, "tx-6", "alice", "ore", 2)!;
  tx.toUserId = "bob";
  assert.equal(refundTransfer(ledger, tx), true);
  assert.equal(commitTransfer(ledger, tx), false);
  assert.equal(refundTransfer(ledger, tx), false);
  assert.equal(balanceOf(ledger, "alice", "ore"), 3);
  assert.equal(balanceOf(ledger, "bob", "ore"), 0);
});

test("transferItem moves balance exactly once between friends", () => {
  const ledger = ledgerWithAlice();
  const result = transferItem(ledger, () => true, "tx-7", "alice", "bob", "ore", 2);
  assert.deepEqual(result, { ok: true });
  assert.equal(balanceOf(ledger, "alice", "ore"), 1);
  assert.equal(balanceOf(ledger, "bob", "ore"), 2);
});

test("transferItem rejects non-friends before touching the ledger", () => {
  const ledger = ledgerWithAlice();
  const result = transferItem(ledger, () => false, "tx-8", "alice", "bob", "ore", 2);
  assert.deepEqual(result, { ok: false, reason: "not_friends" });
  assert.equal(balanceOf(ledger, "alice", "ore"), 3);
  assert.equal(balanceOf(ledger, "bob", "ore"), 0);
});

test("transferItem rejects insufficient balance and leaves the ledger untouched", () => {
  const ledger = ledgerWithAlice();
  const result = transferItem(ledger, () => true, "tx-9", "alice", "bob", "ore", 99);
  assert.deepEqual(result, { ok: false, reason: "insufficient_balance" });
  assert.equal(balanceOf(ledger, "alice", "ore"), 3);
  assert.equal(balanceOf(ledger, "bob", "ore"), 0);
});

test("transferItem prevents double-spend across back-to-back calls", () => {
  const ledger = ledgerWithAlice(2);
  assert.deepEqual(transferItem(ledger, () => true, "tx-10", "alice", "bob", "ore", 2), {
    ok: true,
  });
  assert.deepEqual(transferItem(ledger, () => true, "tx-11", "alice", "cara", "ore", 2), {
    ok: false,
    reason: "insufficient_balance",
  });
  assert.equal(balanceOf(ledger, "alice", "ore"), 0);
  assert.equal(balanceOf(ledger, "bob", "ore"), 2);
  assert.equal(balanceOf(ledger, "cara", "ore"), 0);
});
