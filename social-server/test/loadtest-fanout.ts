// Server-side fanout stress test for the "10 人同房不卡" performance target
// (2026-07-08 用户拍板). This does NOT test combat sync (there isn't any --
// see ws-protocol.ts's StateMessage header) -- it only proves the lobby
// WS layer's raw room-routing/broadcast path can fan a 20Hz state stream out
// to a full 10-person room within budget, on localhost loopback. Client-side
// rendering/interpolation is explicitly out of scope (not this server's job).
//
// Scenario: fill one room to ROOM_CAPACITY (10) real WS clients. One client
// sends `state` messages at LOADTEST_HZ (default 20) for LOADTEST_DURATION_MS
// (default 30000ms); the other 9 receive and each measures end-to-end
// latency (receiver's Date.now() minus the sender's `sentAt`) and tracks
// whether the discard-on-stale-seq rule (ws-protocol.ts) would ever have to
// fire. Pass criterion: P95 end-to-end latency < 50ms.
//
// Run: npm run loadtest:fanout   (takes ~30s+ by default)

import assert from "node:assert/strict";
import WebSocket from "ws";
import { startServer } from "../src/server.js";
import { ROOM_CAPACITY } from "../src/rooms.js";
import type { ServerToClientMessage } from "../src/ws-protocol.js";

process.env.JWT_SECRET = "loadtest-secret";
process.env.SOCIAL_SERVER_PORT = "0";

const DURATION_MS = Number(process.env.LOADTEST_DURATION_MS ?? 30_000);
const HZ = Number(process.env.LOADTEST_HZ ?? 20);
const INTERVAL_MS = 1000 / HZ;
const P95_BUDGET_MS = 50;

interface AuthResponse {
  token: string;
  user: { id: string; username: string };
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: text.length > 0 ? (JSON.parse(text) as T) : (undefined as T) };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function waitOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return;
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

async function waitRoomState(ws: WebSocket, memberCount: number, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timed out waiting for room_state`)), 5000);
    const onMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as ServerToClientMessage;
      if (message.type === "room_state" && message.room.members.length === memberCount) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve();
      }
    };
    ws.on("message", onMessage);
  });
}

interface ReceiverStats {
  userId: string;
  latenciesMs: number[];
  staleDiscarded: number;
  received: number;
  highestSeqSeen: number;
}

async function main(): Promise<void> {
  const social = await startServer(0, { dbPath: ":memory:" });
  const baseUrl = social.url;
  const wsUrl = baseUrl.replace("http://", "ws://") + "/ws";
  const sockets: WebSocket[] = [];

  try {
    console.log(`server started ${baseUrl}`);
    console.log(`scenario: ${ROOM_CAPACITY} clients, 1 sender @ ${HZ}Hz for ${DURATION_MS}ms, P95 budget ${P95_BUDGET_MS}ms`);

    // Register ROOM_CAPACITY users and fill one room to exactly capacity.
    const users: AuthResponse[] = [];
    for (let i = 0; i < ROOM_CAPACITY; i++) {
      const res = await requestJson<AuthResponse>(baseUrl, "/auth/register", {
        method: "POST",
        body: { username: `loadtest-u${i}`, password: "pw" },
      });
      assert.equal(res.status, 201, `register u${i} failed`);
      users.push(res.body);
    }

    const createRoom = await requestJson<{ room: { id: string } }>(baseUrl, "/rooms", {
      method: "POST",
      token: users[0].token,
      body: { levelId: "L1" },
    });
    assert.equal(createRoom.status, 201);
    const roomId = createRoom.body.room.id;

    for (let i = 1; i < ROOM_CAPACITY; i++) {
      const joined = await requestJson(baseUrl, `/rooms/${roomId}/join`, { method: "POST", token: users[i].token });
      assert.equal(joined.status, 200, `join u${i} failed`);
    }
    console.log(`room ${roomId} filled to capacity (${ROOM_CAPACITY})`);

    // Open one WS per user, all subscribe via `join`.
    const wsList = users.map(() => new WebSocket(wsUrl));
    sockets.push(...wsList);
    await Promise.all(wsList.map(waitOpen));
    wsList.forEach((ws, i) => ws.send(JSON.stringify({ type: "join", token: users[i].token, roomId })));
    await Promise.all(wsList.map((ws, i) => waitRoomState(ws, ROOM_CAPACITY, `u${i}`)));
    console.log(`all ${ROOM_CAPACITY} sockets subscribed`);

    const [senderWs, ...receiverWsList] = wsList;
    const receiverStats: ReceiverStats[] = users.slice(1).map((u) => ({
      userId: u.user.id,
      latenciesMs: [],
      staleDiscarded: 0,
      received: 0,
      highestSeqSeen: 0,
    }));

    receiverWsList.forEach((ws, i) => {
      const stats = receiverStats[i];
      ws.on("message", (data) => {
        const message = JSON.parse(data.toString()) as ServerToClientMessage;
        if (message.type !== "state") return;
        stats.received += 1;
        // Application-level "unreliable channel" discard rule from
        // ws-protocol.ts: a state message that arrives with seq <= the
        // highest seq already accepted is treated as if it had been
        // dropped by the network, and does not count toward latency.
        if (message.seq <= stats.highestSeqSeen) {
          stats.staleDiscarded += 1;
          return;
        }
        stats.highestSeqSeen = message.seq;
        stats.latenciesMs.push(Date.now() - message.sentAt);
      });
    });

    // Drive the sender at HZ for DURATION_MS.
    let seq = 0;
    let sent = 0;
    const sendTimer = setInterval(() => {
      seq += 1;
      senderWs.send(
        JSON.stringify({ type: "state", seq, payload: { x: seq, y: -seq }, sentAt: Date.now() }),
      );
      sent += 1;
    }, INTERVAL_MS);

    await new Promise((resolve) => setTimeout(resolve, DURATION_MS));
    clearInterval(sendTimer);
    // Drain in-flight messages before measuring.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const receiverCount = receiverStats.length;
    const expectedDeliveries = sent * receiverCount;
    const actualReceived = receiverStats.reduce((sum, s) => sum + s.received, 0);
    const totalStaleDiscarded = receiverStats.reduce((sum, s) => sum + s.staleDiscarded, 0);
    const transportLoss = expectedDeliveries - actualReceived;

    const allLatencies = receiverStats.flatMap((s) => s.latenciesMs).sort((a, b) => a - b);
    const p50 = percentile(allLatencies, 50);
    const p95 = percentile(allLatencies, 95);
    const p99 = percentile(allLatencies, 99);
    const max = allLatencies[allLatencies.length - 1] ?? NaN;

    console.log(`sender: ${sent} state messages sent (seq 1..${seq})`);
    console.log(`receivers: ${receiverCount}, expected deliveries: ${expectedDeliveries}, actual received: ${actualReceived}`);
    console.log(`transport loss (expected~0 on TCP loopback): ${transportLoss}`);
    console.log(`stale-seq discarded (application-level, per receiver highest-seq rule): ${totalStaleDiscarded}`);
    console.log(`end-to-end latency ms -- p50: ${p50.toFixed(2)}, p95: ${p95.toFixed(2)}, p99: ${p99.toFixed(2)}, max: ${max.toFixed(2)}`);

    if (p95 < P95_BUDGET_MS) {
      console.log(`LOADTEST OK -- P95 ${p95.toFixed(2)}ms < ${P95_BUDGET_MS}ms budget`);
    } else {
      console.log(`LOADTEST FAILED -- P95 ${p95.toFixed(2)}ms >= ${P95_BUDGET_MS}ms budget`);
      process.exitCode = 1;
    }
  } finally {
    for (const ws of sockets) {
      if (ws.readyState !== WebSocket.CLOSED) ws.close();
    }
    await social.close();
  }
}

main().catch((error: unknown) => {
  console.error("LOADTEST FAILED (exception)");
  console.error(error);
  process.exit(1);
});
