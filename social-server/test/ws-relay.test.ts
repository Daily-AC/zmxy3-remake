import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import WebSocket, { type WebSocketServer } from "ws";
import type { SocialDb } from "../src/db.js";
import { RoomManager } from "../src/rooms.js";
import { attachRoomWebSocketServer } from "../src/ws-server.js";
import type { ServerToClientMessage } from "../src/ws-protocol.js";

process.env.JWT_SECRET = "ws-relay-test-secret";

interface FakeUser {
  id: string;
  username: string;
}

class FakeWss extends EventEmitter {
  connect(socket: FakeSocket): void {
    this.emit("connection", socket as unknown as WebSocket);
  }
}

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  sent: ServerToClientMessage[] = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ServerToClientMessage);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }

  receive(message: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(message)));
  }
}

function fakeDb(users: FakeUser[]): SocialDb {
  const byId = new Map(users.map((user) => [user.id, user]));
  return {
    prepare() {
      return {
        get(id: number) {
          const user = byId.get(String(id));
          return user ? { id: Number(user.id), username: user.username } : undefined;
        },
      };
    },
  } as unknown as SocialDb;
}

function tokenFor(user: FakeUser): string {
  return jwt.sign({ sub: user.id, username: user.username }, process.env.JWT_SECRET!);
}

function relayHarness(users: FakeUser[]): { roomId: string; wss: FakeWss } {
  const roomManager = new RoomManager();
  const room = roomManager.create("L1", { userId: users[0]!.id, username: users[0]!.username });
  for (const user of users.slice(1)) roomManager.join(room.id, { userId: user.id, username: user.username });

  const wss = new FakeWss();
  attachRoomWebSocketServer(wss as unknown as WebSocketServer, roomManager, fakeDb(users));
  return { roomId: room.id, wss };
}

test("room websocket relays generic state and event frames with injected sender id", () => {
  const alice = { id: "1", username: "relay-alice" };
  const bob = { id: "2", username: "relay-bob" };
  const { roomId, wss } = relayHarness([alice, bob]);
  const aliceSocket = new FakeSocket();
  const bobSocket = new FakeSocket();

  wss.connect(aliceSocket);
  wss.connect(bobSocket);
  aliceSocket.receive({ type: "join", token: tokenFor(alice), roomId });
  bobSocket.receive({ type: "join", token: tokenFor(bob), roomId });

  assert.equal(aliceSocket.sent[0]?.type, "room_state");
  assert.equal(bobSocket.sent[0]?.type, "room_state");

  const statePayload = { coopType: "hero_state", hero: { userId: alice.id, x: 10, y: 20 } };
  aliceSocket.receive({ type: "state", seq: 42, sentAt: 1234, payload: statePayload });
  const relayedState = bobSocket.sent.find((message) => message.type === "state" && message.seq === 42);
  assert(relayedState);
  assert.equal(relayedState.type, "state");
  assert.equal(relayedState.fromUserId, alice.id);
  assert.equal(relayedState.sentAt, 1234);
  assert.deepEqual(relayedState.payload, statePayload);

  const eventPayload = { attackerUserId: bob.id, targetMonsterId: "m-1", attackId: "hit1" };
  bobSocket.receive({ type: "event", name: "hit_intent", payload: eventPayload });
  const relayedEvent = aliceSocket.sent.find(
    (message) => message.type === "event" && message.name === "hit_intent",
  );
  assert(relayedEvent);
  assert.equal(relayedEvent.type, "event");
  assert.equal(relayedEvent.fromUserId, bob.id);
  assert.deepEqual(relayedEvent.payload, eventPayload);
});
