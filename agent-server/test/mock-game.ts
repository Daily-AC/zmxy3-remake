// Fake game client used to self-test the agent-server end to end against a
// real LLM (no mocking of the model). Spawns the server as a subprocess,
// drives it over the real WebSocket protocol, asserts on real responses,
// and can refresh the checked-in transcript with UPDATE_NPC_TRANSCRIPT=1.
//
// Run with: npm run test:mock

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { writeFileSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocket } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
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

async function reservePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to reserve a test port");
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
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
  const port = await reservePort();
  const wsUrl = `ws://127.0.0.1:${port}`;
  const serverEntry = path.join(REPO_ROOT, "src", "server.ts");
  const child = spawn(
    path.join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [serverEntry],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, AGENT_SERVER_PORT: String(port) },
    },
  ) as ChildProcessWithoutNullStreams;

  try {
    await waitForServerReady(child);

    const ws = new WebSocket(wsUrl);
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

    const welcome = waitFor((m) => m.type === "welcome", 15_000);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    log("connected to agent-server");

    await welcome;
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

    ws.close();

    if (process.env.UPDATE_NPC_TRANSCRIPT === "1") {
      writeFileSync(
        path.join(__dirname, "transcript.json"),
        JSON.stringify(transcript, null, 2),
        "utf-8",
      );
      log(`wrote transcript with ${transcript.length} entries to test/transcript.json`);
    }
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
