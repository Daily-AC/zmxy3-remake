// Real-provider (opencode + DeepSeek V4 Flash) forge round-trip. Unlike
// forge-mock.ts (deterministic, asserts exact clamped values), this drives the
// actual LLM: it proves a real, model-generated piece of equipment survives the
// server's static sandbox AND passes the game-side budget validation. Needs
// DEEPSEEK_API_KEY in the environment (never in a file). Prints the real item +
// flavor so the field shape can be compared against the mock in the report.
//
// Run with: npm run test:real   (optionally REMOTE_WS=wss://... to hit home)

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
const PORT = 5183;
const NPC_ID = "laojun";
const ENGINE = { atk: 200, def: 200, hp: 800, mp: 800, crit: 0.5, onHitChance: 0.5, onHitPower: 30 };

function log(...args: unknown[]): void {
  console.log("[forge-real]", ...args);
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
    }, 30000);
  });
}

async function main(): Promise<void> {
  // Either hit a remote deployment (REMOTE_WS) or spawn a local server.
  const remoteUrl = process.env.REMOTE_WS;
  let child: ChildProcessWithoutNullStreams | undefined;
  let wsUrl: string;

  if (remoteUrl) {
    wsUrl = remoteUrl;
    log(`using REMOTE server ${wsUrl} (no local spawn)`);
  } else {
    const serverEntry = path.join(REPO_ROOT, "src", "server.ts");
    child = spawn(path.join(REPO_ROOT, "node_modules", ".bin", "tsx"), [serverEntry], {
      cwd: REPO_ROOT,
      // default provider = opencode+DeepSeek; NPC_BRAIN_PROVIDER unset on purpose
      env: { ...process.env, AGENT_SERVER_PORT: String(PORT) },
    }) as ChildProcessWithoutNullStreams;
    await waitForServerReady(child);
    wsUrl = `ws://localhost:${PORT}`;
  }

  try {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    log("connected to agent-server (provider=opencode+DeepSeek)");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Waiter = { pred: (m: any) => boolean; resolve: (m: any) => void };
    const waiters: Waiter[] = [];
    ws.on("message", (raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m: any = JSON.parse(raw.toString());
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].pred(m)) waiters.splice(i, 1)[0].resolve(m);
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function waitFor(pred: (m: any) => boolean, timeoutMs = 90000): Promise<any> {
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

    // Generous budget (45 玄铁碎片, 675 pts -> every cap at engine max, and more
    // than the max possible 3-effect item cost) so ANY in-sandbox real item is
    // affordable; this test is about real shape + acceptance, not the reject
    // path (unit-tested separately).
    const blackIron: Item = { id: "black_iron", name: "玄铁碎片", kind: "material", rarity: 3 };
    const lots: MaterialLot[] = [{ item: blackIron, qty: 45 }];
    const budget = computeBudget(lots);
    const requestId = `real-req-${Date.now()}`;
    const description = "一把又能吸血、又能点燃敌人的赤红长枪，攻击也要高";

    ws.send(
      JSON.stringify({
        type: "craft_request",
        npcId: NPC_ID,
        requestId,
        description,
        materials: lots.map((l) => ({ id: l.item.id, name: l.item.name, rarity: l.item.rarity, qty: l.qty })),
        budget,
      }),
    );
    log(`sent craft_request (${requestId}): "${description}", budget ${budget.points} pts`);

    const result = await waitFor((m) => m.type === "craft_result" && m.requestId === requestId);
    log("REAL craft_result item:", JSON.stringify(result.item));
    log("REAL craft_result flavor:", result.flavor);

    // ---- assertion 1: legal, statically-clamped CraftedItem (real values) ----
    const item = result.item;
    if (!item || item.kind !== "equip") throw new Error(`bad item kind: ${JSON.stringify(item)}`);
    if (![1, 2, 3].includes(item.rarity)) throw new Error(`rarity out of range: ${item.rarity}`);
    if (!Array.isArray(item.effects) || item.effects.length > 3)
      throw new Error(`effects must be an array of <=3: ${JSON.stringify(item.effects)}`);
    for (const e of item.effects) {
      if (e.type === "stat") {
        const max = (ENGINE as Record<string, number>)[e.stat];
        if (max === undefined) throw new Error(`illegal stat name: ${e.stat}`);
        if (e.value < 0 || e.value > max) throw new Error(`stat ${e.stat} out of [0,${max}]: ${e.value}`);
      } else if (e.type === "onHit") {
        if (!["burn", "lifesteal", "freeze"].includes(e.effect)) throw new Error(`illegal onHit: ${e.effect}`);
        if (e.chance < 0 || e.chance > ENGINE.onHitChance) throw new Error(`onHit chance oob: ${e.chance}`);
        if (e.power < 0 || e.power > ENGINE.onHitPower) throw new Error(`onHit power oob: ${e.power}`);
      } else {
        throw new Error(`unknown effect type: ${JSON.stringify(e)}`);
      }
    }
    if (typeof result.flavor !== "string" || result.flavor.length === 0)
      throw new Error("missing flavor line");
    log("assertion 1 PASSED: real LLM item is a legal, in-sandbox CraftedItem");

    // ---- assertion 2: the real game-side furnace ACCEPTS it into the bag ----
    const validation = validateCraftedEquipment(item, budget);
    if (!validation.ok) throw new Error(`game furnace rejected real item: ${JSON.stringify(validation)}`);
    log(
      `assertion 2 PASSED: game furnace accepted real item (cost ${validation.totalCost.toFixed(1)} / ${budget.points} pts) -> would enter bag as "${validation.item.name}"`,
    );

    ws.close();
    log("ALL ASSERTIONS PASSED");
  } finally {
    child?.kill();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[forge-real] FAILED:", err);
    process.exit(1);
  });
