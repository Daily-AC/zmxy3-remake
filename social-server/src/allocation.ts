export interface SplitResult {
  userId: string;
  amount: number;
}

// Precondition: killerUserId is present. In real play the killer is always
// present because an absent player cannot land the kill; callers own that check.
export function splitAmongPresent(total: number, presentUserIds: string[], killerUserId: string): SplitResult[] {
  if (!presentUserIds.includes(killerUserId)) {
    throw new Error("killerUserId must be present to receive the remainder");
  }

  const base = Math.floor(total / presentUserIds.length);
  const remainder = total % presentUserIds.length;
  return presentUserIds.map((userId) => ({
    userId,
    amount: base + (userId === killerUserId ? remainder : 0),
  }));
}

export interface DropTableEntry {
  itemId: string;
  chance: number;
}

export interface DropRoll {
  userId: string;
  itemId: string;
}

export function rollDropsForPresent(
  table: DropTableEntry[],
  presentUserIds: string[],
  rng: () => number = Math.random,
): DropRoll[] {
  const drops: DropRoll[] = [];
  for (const userId of presentUserIds) {
    for (const entry of table) {
      if (rng() < entry.chance) drops.push({ userId, itemId: entry.itemId });
    }
  }
  return drops;
}

export type Ledger = Map<string, Map<string, number>>;

export function createLedger(): Ledger {
  return new Map();
}

function accountFor(ledger: Ledger, userId: string): Map<string, number> {
  let account = ledger.get(userId);
  if (!account) {
    account = new Map();
    ledger.set(userId, account);
  }
  return account;
}

function normalizeQty(qty: number): number {
  return Math.max(0, Math.floor(qty));
}

export function credit(ledger: Ledger, userId: string, itemId: string, qty: number): void {
  const amount = normalizeQty(qty);
  const account = accountFor(ledger, userId);
  account.set(itemId, balanceOf(ledger, userId, itemId) + amount);
}

export function balanceOf(ledger: Ledger, userId: string, itemId: string): number {
  return ledger.get(userId)?.get(itemId) ?? 0;
}

export interface TransferTx {
  id: string;
  fromUserId: string;
  toUserId: string;
  itemId: string;
  qty: number;
  status: "pending" | "committed" | "refunded";
}

// This module is only a minimal pure ownership ledger to prove the transaction
// safety pattern. Wiring it to the game's real inventory belongs to a future
// integration task; social-server intentionally does not import game code.

export function lockTransfer(
  ledger: Ledger,
  txId: string,
  fromUserId: string,
  itemId: string,
  qty: number,
): TransferTx | null {
  const amount = normalizeQty(qty);
  if (amount <= 0 || balanceOf(ledger, fromUserId, itemId) < amount) return null;
  const account = accountFor(ledger, fromUserId);
  account.set(itemId, balanceOf(ledger, fromUserId, itemId) - amount);
  return { id: txId, fromUserId, toUserId: "", itemId, qty: amount, status: "pending" };
}

export function commitTransfer(ledger: Ledger, tx: TransferTx): boolean {
  if (tx.status !== "pending") return false;
  if (!tx.toUserId) throw new Error("toUserId must be set before committing a transfer");
  credit(ledger, tx.toUserId, tx.itemId, tx.qty);
  tx.status = "committed";
  return true;
}

export function refundTransfer(ledger: Ledger, tx: TransferTx): boolean {
  if (tx.status !== "pending") return false;
  credit(ledger, tx.fromUserId, tx.itemId, tx.qty);
  tx.status = "refunded";
  return true;
}

export type TransferResult =
  | { ok: true }
  | { ok: false; reason: "not_friends" | "insufficient_balance" };

export function transferItem(
  ledger: Ledger,
  areFriends: (a: string, b: string) => boolean,
  txId: string,
  fromUserId: string,
  toUserId: string,
  itemId: string,
  qty: number,
): TransferResult {
  if (!areFriends(fromUserId, toUserId)) return { ok: false, reason: "not_friends" };

  // No await appears between friend check, lock, and commit. In this
  // single-process JS ledger, the whole check-deduct-credit sequence runs to
  // completion before another transfer call can interleave, preventing a
  // double-spend against the same balance.
  const tx = lockTransfer(ledger, txId, fromUserId, itemId, qty);
  if (!tx) return { ok: false, reason: "insufficient_balance" };
  tx.toUserId = toUserId;
  commitTransfer(ledger, tx);
  return { ok: true };
}
