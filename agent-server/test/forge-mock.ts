// End-to-end self-test for the structured furnace forge, using the deterministic
// `mock` provider (no LLM, no API key needed). Spawns the real server, drives it
// over the real WebSocket protocol, and — crucially — validates the returned item
// with the REAL game-side furnace module (game/src/systems/furnace.ts), so this
// exercises the whole boundary: server static clamp over the wire + game budget
// re-clamp/accept. That the mock deliberately emits out-of-range values (atk 999,
// onHit power 999, chance 0.9) is the point: seeing them come back in range proves
// the clamp fired end to end.
//
// Run with: npm run test:forge

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocket } from "ws";
import {
  computeBudget,
  validateCraftedEquipment,
  type MaterialLot,
} from "../../game/src/systems/furnace.ts";
import type { Item } from "../../game/src/systems/items.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const PORT = 5182;
const WS_URL = `ws://localhost:${PORT}`;
const NPC_ID = "laojun";

// Engine ceilings the server's static clamp must never let a field exceed.
const ENGINE = { atk: 50, def: 50, hp: 200, mp: 200, crit: 0.5, onHitChance: 0.5, onHitPower: 30 };

function log(...args: unknown[]): void {
  console.log("[forge-mock]", ...args);
}

function waitForServerReady(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    child.stdout.on("data", (buf: Buffer) => {
      const line = buf.toString();
      process.stdout.write(`[agent-server] ${line}`);
      if (!resolved && line.includes("listening on")) {
        resolved = true;
        resolve();
      }
    });
    child.stderr.on("data", (buf: Buffer) => process.stderr.write(`[agent-server:err] ${buf}`));
    child.on("exit", (code) => {
      if (!resolved) reject(new Error(`agent-server exited early with code ${code}`));
    });
    setTimeout(() => {
      if (!resolved) reject(new Error("timed out waiting for agent-server to start"));
    }, 15000);
  });
}

async function main(): Promise<void> {
  const serverEntry = path.join(REPO_ROOT, "src", "server.ts");
  const child = spawn(path.join(REPO_ROOT, "node_modules", ".bin", "tsx"), [serverEntry], {
    cwd: REPO_ROOT,
    env: { ...process.env, AGENT_SERVER_PORT: String(PORT), NPC_BRAIN_PROVIDER: "mock" },
  }) as ChildProcessWithoutNullStreams;

  try {
    await waitForServerReady(child);

    const ws = new WebSocket(WS_URL);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    log("connected to agent-server (provider=mock)");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Waiter = { pred: (m: any) => boolean; resolve: (m: any) => void };
    const waiters: Waiter[] = [];
    ws.on("message", (raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m: any = JSON.parse(raw.toString());
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].pred(m)) {
          const [w] = waiters.splice(i, 1);
          w.resolve(m);
        }
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function waitFor(pred: (m: any) => boolean, timeoutMs = 10000): Promise<any> {
      return new Promise((resolve, reject) => {
        const waiter: Waiter = { pred, resolve };
        const timer = setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error("timed out waiting for message"));
        }, timeoutMs);
        waiter.resolve = (m) => {
          clearTimeout(timer);
          resolve(m);
        };
        waiters.push(waiter);
      });
    }

    await waitFor((m) => m.type === "welcome");
    ws.send(JSON.stringify({ type: "hello", player: { id: "tester", name: "斗战胜佛" } }));

    // The player spends 7 玄铁碎片 (rarity 3) -> a budget big enough that the
    // clamped item (atk 50 + burn 30/0.5) is affordable and the game accepts it.
    const blackIron: Item = { id: "black_iron", name: "玄铁碎片", kind: "material", rarity: 3 };
    const lots: MaterialLot[] = [{ item: blackIron, qty: 7 }];
    const budget = computeBudget(lots);
    const requestId = "forge-req-1";
    const description = "一把会喷火的法杖";

    ws.send(
      JSON.stringify({
        type: "craft_request",
        npcId: NPC_ID,
        requestId,
        description,
        materials: lots.map((l) => ({
          id: l.item.id,
          name: l.item.name,
          rarity: l.item.rarity,
          qty: l.qty,
        })),
        budget,
      }),
    );
    log(`sent craft_request (${requestId}): "${description}", budget ${budget.points} pts`);

    const result = await waitFor((m) => m.type === "craft_result" && m.requestId === requestId);
    log("received craft_result:", JSON.stringify({ item: result.item, flavor: result.flavor }));

    // ---- assertion 1: server returned a legal, statically-clamped CraftedItem ----
    const item = result.item;
    if (!item || item.kind !== "equip") throw new Error(`bad item kind: ${JSON.stringify(item)}`);
    if (![1, 2, 3].includes(item.rarity)) throw new Error(`rarity out of range: ${item.rarity}`);
    if (!Array.isArray(item.effects) || item.effects.length > 3)
      throw new Error(`effects should be an array of <=3: ${JSON.stringify(item.effects)}`);
    let sawClampedAtk = false;
    let sawClampedOnHit = false;
    for (const e of item.effects) {
      if (e.type === "stat") {
        const max = (ENGINE as Record<string, number>)[e.stat];
        if (max === undefined) throw new Error(`illegal stat name: ${e.stat}`);
        if (e.value < 0 || e.value > max) throw new Error(`stat ${e.stat} out of [0,${max}]: ${e.value}`);
        if (e.stat === "atk" && e.value === ENGINE.atk) sawClampedAtk = true; // 999 -> 50
      } else if (e.type === "onHit") {
        if (e.chance < 0 || e.chance > ENGINE.onHitChance) throw new Error(`onHit chance out of range: ${e.chance}`);
        if (e.power < 0 || e.power > ENGINE.onHitPower) throw new Error(`onHit power out of range: ${e.power}`);
        if (e.chance === ENGINE.onHitChance && e.power === ENGINE.onHitPower) sawClampedOnHit = true; // 0.9/999 -> 0.5/30
      } else {
        throw new Error(`unknown effect type: ${JSON.stringify(e)}`);
      }
    }
    if (!sawClampedAtk) throw new Error("expected the over-max atk (999) to come back clamped to 50");
    if (!sawClampedOnHit) throw new Error("expected the over-max burn (0.9/999) to come back clamped to 0.5/30");
    if (typeof result.flavor !== "string" || result.flavor.length === 0)
      throw new Error("craft_result missing 太上老君's flavor line");
    if (!result.flavor.includes("玄铁碎片")) throw new Error("flavor line should quote the spent material");
    log("assertion 1 PASSED: server static clamp fired over the wire (atk 999->50, burn 0.9/999->0.5/30)");

    // ---- assertion 2: the real game-side furnace validation ACCEPTS the item ----
    const validation = validateCraftedEquipment(item, budget);
    if (!validation.ok)
      throw new Error(`game furnace rejected a within-budget item: ${JSON.stringify(validation)}`);
    log(
      `assertion 2 PASSED: game furnace accepted it (cost ${validation.totalCost.toFixed(1)} / ${budget.points} pts)`,
    );

    ws.close();
    log("ALL ASSERTIONS PASSED");
  } finally {
    child.kill();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[forge-mock] FAILED:", err);
    process.exit(1);
  });
