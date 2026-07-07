// Fake game client used to self-test the agent-server end to end against a
// real LLM (no mocking of the model). Spawns the server as a subprocess,
// drives it over the real WebSocket protocol, asserts on real responses,
// and dumps the full transcript to test/transcript.json.
//
// Run with: npm run test:mock

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocket } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const PORT = 5181;
const WS_URL = `ws://localhost:${PORT}`;
const NPC_ID = "laojun";
const MONSTER_A = "赤炎狼";
const MONSTER_B = "石头怪";

interface TranscriptEntry {
  direction: "game->server" | "server->game";
  message: unknown;
  at: number;
}

const transcript: TranscriptEntry[] = [];

function log(...args: unknown[]): void {
  console.log("[mock-game]", ...args);
}

function waitForServerReady(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const onData = (buf: Buffer) => {
      const line = buf.toString();
      process.stdout.write(`[agent-server] ${line}`);
      if (!resolved && line.includes("listening on")) {
        resolved = true;
        resolve();
      }
    };
    child.stdout.on("data", onData);
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
  const child = spawn(
    path.join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [serverEntry],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, AGENT_SERVER_PORT: String(PORT) },
    },
  ) as ChildProcessWithoutNullStreams;

  try {
    await waitForServerReady(child);

    const ws = new WebSocket(WS_URL);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    log("connected to agent-server");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Waiter = { pred: (m: any) => boolean; resolve: (m: any) => void };
    const waiters: Waiter[] = [];

    ws.on("message", (raw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m: any = JSON.parse(raw.toString());
      transcript.push({ direction: "server->game", message: m, at: Date.now() });
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].pred(m)) {
          const [w] = waiters.splice(i, 1);
          w.resolve(m);
        }
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function waitFor(pred: (m: any) => boolean, timeoutMs = 90000): Promise<any> {
      return new Promise((resolve, reject) => {
        const waiter: Waiter = {
          pred,
          resolve: (m) => {
            clearTimeout(timer);
            resolve(m);
          },
        };
        const timer = setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error("timed out waiting for message matching predicate"));
        }, timeoutMs);
        waiters.push(waiter);
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function sendMsg(msg: any): void {
      transcript.push({ direction: "game->server", message: msg, at: Date.now() });
      ws.send(JSON.stringify(msg));
    }

    await waitFor((m) => m.type === "welcome");
    log("received welcome");

    sendMsg({ type: "hello", player: { id: "tester", name: "斗战胜佛" } });

    sendMsg({ type: "world_event", kind: "monster_killed", data: { monster: MONSTER_A } });
    sendMsg({ type: "world_event", kind: "monster_killed", data: { monster: MONSTER_B } });
    log(`injected 2 world events: monster_killed ${MONSTER_A}, ${MONSTER_B}`);

    sendMsg({ type: "player_say", npcId: NPC_ID, text: "老君，我刚才战况如何？" });

    await waitFor((m) => m.type === "npc_thinking" && m.npcId === NPC_ID);
    log("received npc_thinking (turn 1)");

    const say1 = await waitFor((m) => m.type === "npc_say" && m.npcId === NPC_ID);
    log("received npc_say (turn 1):", say1.text);

    const mentionsA = say1.text.includes(MONSTER_A);
    const mentionsB = say1.text.includes(MONSTER_B);
    if (!mentionsA && !mentionsB) {
      throw new Error(
        `npc_say did not reference either injected monster name (${MONSTER_A}/${MONSTER_B}): "${say1.text}"`,
      );
    }
    if (!(mentionsA && mentionsB)) {
      log(`WARNING: npc_say only referenced one of the two monster names (A=${mentionsA} B=${mentionsB})`);
    }

    sendMsg({
      type: "player_say",
      npcId: NPC_ID,
      text: "老君，我打怪打得辛苦，好歹赏我点什么当奖励吧！",
    });

    await waitFor((m) => m.type === "npc_thinking" && m.npcId === NPC_ID);
    log("received npc_thinking (turn 2)");

    const [say2, gift] = await Promise.all([
      waitFor((m) => m.type === "npc_say" && m.npcId === NPC_ID),
      waitFor((m) => m.type === "give_item" && m.npcId === NPC_ID),
    ]);
    log("received npc_say (turn 2):", say2.text);
    log("received give_item:", JSON.stringify(gift.item));

    if (!gift.item || typeof gift.item.name !== "string" || gift.item.name.length === 0) {
      throw new Error(`give_item payload missing a usable item.name: ${JSON.stringify(gift)}`);
    }

    // ---- crafting scenario ----
    sendMsg({ type: "world_event", kind: "item_obtained", data: { item: "白银矿石" } });
    sendMsg({ type: "world_event", kind: "item_obtained", data: { item: "白银矿石" } });
    log("injected 2 world events: item_obtained 白银矿石");

    sendMsg({
      type: "player_say",
      npcId: NPC_ID,
      text: "老君，我想要一把会吸血、还能点着火的法杖，你能帮我炼一把不？",
    });

    await waitFor((m) => m.type === "npc_thinking" && m.npcId === NPC_ID);
    log("received npc_thinking (craft turn 1: request)");

    const quote = await waitFor((m) => m.type === "npc_say" && m.npcId === NPC_ID);
    log("received npc_say (craft turn 1, should be a materials quote):", quote.text);

    const prematureCraft = transcript.some(
      (e) =>
        e.direction === "server->game" &&
        (e.message as { type?: string }).type === "craft_item",
    );
    if (prematureCraft) {
      throw new Error("craft_item was sent before the player confirmed handing over materials");
    }

    sendMsg({
      type: "player_say",
      npcId: NPC_ID,
      text: "材料都给你备齐了——不管你刚才要的是白银矿石还是别的什么，我都一并带来了，一样不少，麻烦老君现在就帮我炼一把！",
    });

    await waitFor((m) => m.type === "npc_thinking" && m.npcId === NPC_ID);
    log("received npc_thinking (craft turn 2: confirm)");

    const [say3Result, craftedResult] = await Promise.allSettled([
      waitFor((m) => m.type === "npc_say" && m.npcId === NPC_ID),
      waitFor((m) => m.type === "craft_item" && m.npcId === NPC_ID),
    ]);
    if (say3Result.status === "rejected" || craftedResult.status === "rejected") {
      throw new Error(
        `craft turn 2 incomplete: npc_say ${say3Result.status}, craft_item ${craftedResult.status}`,
      );
    }
    const say3 = say3Result.value;
    const crafted = craftedResult.value;
    log("received npc_say (craft turn 2):", say3.text);
    log("received craft_item:", JSON.stringify(crafted.item));

    const item = crafted.item;
    if (!item || typeof item.name !== "string" || item.name.length === 0) {
      throw new Error(`craft_item payload missing a usable item.name: ${JSON.stringify(crafted)}`);
    }
    if (item.kind !== "equip") {
      throw new Error(`craft_item.item.kind should be "equip", got: ${item.kind}`);
    }
    if (![1, 2, 3].includes(item.rarity)) {
      throw new Error(`craft_item.item.rarity out of 1-3 range: ${item.rarity}`);
    }
    if (!Array.isArray(item.effects) || item.effects.length > 3) {
      throw new Error(`craft_item.item.effects should have at most 3 entries, got: ${JSON.stringify(item.effects)}`);
    }
    const STAT_LIMITS: Record<string, number> = { atk: 200, def: 200, hp: 800, mp: 800, crit: 0.5 };
    for (const effect of item.effects) {
      if (effect.type === "stat") {
        const max = STAT_LIMITS[effect.stat];
        if (max === undefined) throw new Error(`illegal stat name in crafted effect: ${effect.stat}`);
        if (effect.value < 0 || effect.value > max) {
          throw new Error(`stat effect ${effect.stat} out of range [0, ${max}]: ${effect.value}`);
        }
      } else if (effect.type === "onHit") {
        if (!["burn", "lifesteal", "freeze"].includes(effect.effect)) {
          throw new Error(`illegal onHit effect name: ${effect.effect}`);
        }
        if (effect.chance < 0 || effect.chance > 0.5) {
          throw new Error(`onHit chance out of range [0, 0.5]: ${effect.chance}`);
        }
        if (effect.power < 0 || effect.power > 30) {
          throw new Error(`onHit power out of range [0, 30]: ${effect.power}`);
        }
      } else {
        throw new Error(`unknown effect type in crafted item: ${JSON.stringify(effect)}`);
      }
    }
    log(`craft_item validated: rarity=${item.rarity}, effects all within legal ranges`);

    ws.close();

    writeFileSync(
      path.join(__dirname, "transcript.json"),
      JSON.stringify(transcript, null, 2),
      "utf-8",
    );
    log(`wrote transcript with ${transcript.length} entries to test/transcript.json`);
    log("ALL ASSERTIONS PASSED");
  } finally {
    child.kill();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[mock-game] FAILED:", err);
    process.exit(1);
  });
