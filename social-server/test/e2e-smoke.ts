import assert from "node:assert/strict";
import WebSocket from "ws";
import { startServer } from "../src/server.js";
import type { ServerToClientMessage } from "../src/ws-protocol.js";

process.env.JWT_SECRET = "e2e-smoke-secret";
process.env.SOCIAL_SERVER_PORT = "0";

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
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as T) : (undefined as T),
  };
}

function connectWs(url: string): {
  ws: WebSocket;
  messages: ServerToClientMessage[];
  waitFor: (predicate: (message: ServerToClientMessage) => boolean, label: string) => Promise<ServerToClientMessage>;
} {
  const ws = new WebSocket(url);
  const messages: ServerToClientMessage[] = [];
  const waiters: Array<{
    predicate: (message: ServerToClientMessage) => boolean;
    resolve: (message: ServerToClientMessage) => void;
    reject: (error: Error) => void;
    label: string;
    timer: NodeJS.Timeout;
  }> = [];

  ws.on("message", (data) => {
    const message = JSON.parse(data.toString()) as ServerToClientMessage;
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        clearTimeout(waiter.timer);
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });

  ws.on("error", (error) => {
    for (const waiter of [...waiters]) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  });

  return {
    ws,
    messages,
    waitFor(predicate, label) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`timed out waiting for ${label}; saw ${JSON.stringify(messages)}`));
        }, 2000);
        waiters.push({ predicate, resolve, reject, label, timer });
      });
    },
  };
}

async function waitOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return;
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

async function closeWs(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => {
    ws.once("close", () => resolve());
    ws.close();
    setTimeout(resolve, 500).unref();
  });
}

async function main(): Promise<void> {
  const social = await startServer(0, { dbPath: ":memory:" });
  const baseUrl = social.url;
  const wsUrl = baseUrl.replace("http://", "ws://") + "/ws";
  const clients: WebSocket[] = [];

  try {
    console.log(`server started ${baseUrl}`);

    const alice = await requestJson<AuthResponse>(baseUrl, "/auth/register", {
      method: "POST",
      body: { username: "alice", password: "alice-pass" },
    });
    const bob = await requestJson<AuthResponse>(baseUrl, "/auth/register", {
      method: "POST",
      body: { username: "bob", password: "bob-pass" },
    });
    assert.equal(alice.status, 201);
    assert.equal(bob.status, 201);
    console.log(`registered users alice=${alice.body.user.id} bob=${bob.body.user.id}`);

    const friendRequest = await requestJson<{ request: { id: string } }>(baseUrl, "/friends/request", {
      method: "POST",
      token: alice.body.token,
      body: { toUsername: "bob" },
    });
    assert.equal(friendRequest.status, 201);
    console.log(`alice sent friend request ${friendRequest.body.request.id}`);

    const accepted = await requestJson<{ request: { status: string } }>(
      baseUrl,
      `/friends/${friendRequest.body.request.id}/accept`,
      { method: "POST", token: bob.body.token },
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.request.status, "accepted");
    console.log("bob accepted friend request");

    const aliceFriends = await requestJson<{ friends: Array<{ username: string }> }>(
      baseUrl,
      "/friends",
      { token: alice.body.token },
    );
    const bobFriends = await requestJson<{ friends: Array<{ username: string }> }>(baseUrl, "/friends", {
      token: bob.body.token,
    });
    assert.equal(aliceFriends.body.friends[0].username, "bob");
    assert.equal(bobFriends.body.friends[0].username, "alice");
    console.log(`friend lists alice=${JSON.stringify(aliceFriends.body.friends)} bob=${JSON.stringify(bobFriends.body.friends)}`);

    const room = await requestJson<{ room: { id: string; levelId: string; ownerId: string } }>(
      baseUrl,
      "/rooms",
      {
        method: "POST",
        token: alice.body.token,
        body: { levelId: "L1" },
      },
    );
    assert.equal(room.status, 201);
    const roomId = room.body.room.id;
    console.log(`alice created room ${roomId}`);

    const bobJoin = await requestJson<{ room: { members: Array<{ username: string }> } }>(
      baseUrl,
      `/rooms/${roomId}/join`,
      { method: "POST", token: bob.body.token },
    );
    assert.equal(bobJoin.status, 200);
    assert.deepEqual(
      bobJoin.body.room.members.map((m) => m.username),
      ["alice", "bob"],
    );
    console.log(`bob joined room ${roomId} via REST`);

    const aliceSocket = connectWs(wsUrl);
    const bobSocket = connectWs(wsUrl);
    clients.push(aliceSocket.ws, bobSocket.ws);
    await Promise.all([waitOpen(aliceSocket.ws), waitOpen(bobSocket.ws)]);

    aliceSocket.ws.send(JSON.stringify({ type: "join", token: alice.body.token, roomId }));
    const aliceState = await aliceSocket.waitFor((m) => m.type === "room_state", "alice room_state");
    assert.equal(aliceState.type, "room_state");
    assert.equal(aliceState.room.members.length, 2);
    console.log(`alice ws room_state members=${aliceState.room.members.map((m) => m.username).join(",")}`);

    bobSocket.ws.send(JSON.stringify({ type: "join", token: bob.body.token, roomId }));
    const bobState = await bobSocket.waitFor((m) => m.type === "room_state", "bob room_state");
    const aliceSawBob = await aliceSocket.waitFor(
      (m) => m.type === "member_joined" && m.member.userId === bob.body.user.id,
      "alice member_joined bob",
    );
    assert.equal(bobState.type, "room_state");
    assert.equal(aliceSawBob.type, "member_joined");
    console.log(`bob ws room_state members=${bobState.room.members.map((m) => m.username).join(",")}`);
    console.log(`alice saw member_joined user=${aliceSawBob.member.userId}`);

    aliceSocket.ws.send(JSON.stringify({ type: "ready", ready: true }));
    bobSocket.ws.send(JSON.stringify({ type: "ready", ready: true }));
    await aliceSocket.waitFor((m) => m.type === "ready_changed" && m.userId === alice.body.user.id && m.ready, "alice ready");
    await aliceSocket.waitFor((m) => m.type === "ready_changed" && m.userId === bob.body.user.id && m.ready, "bob ready");
    console.log("both users ready");

    aliceSocket.ws.send(JSON.stringify({ type: "start" }));
    const aliceStart = await aliceSocket.waitFor((m) => m.type === "game_start", "alice game_start");
    const bobStart = await bobSocket.waitFor((m) => m.type === "game_start", "bob game_start");
    assert.equal(aliceStart.type, "game_start");
    assert.equal(bobStart.type, "game_start");
    assert.equal(aliceStart.levelId, "L1");
    assert.equal(bobStart.levelId, "L1");
    console.log("both sockets received game_start L1");

    console.log("SMOKE OK");
  } finally {
    await Promise.all(clients.map(closeWs));
    await social.close();
  }
}

main().catch((error: unknown) => {
  console.error("SMOKE FAILED");
  console.error(error);
  process.exit(1);
});
