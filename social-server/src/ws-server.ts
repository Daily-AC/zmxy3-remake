import WebSocket, { WebSocketServer } from "ws";
import type { SocialDb } from "./db.js";
import { verifyToken } from "./auth.js";
import { canStart, RoomManager, toRoomSnapshot } from "./rooms.js";
import type { ClientToServerMessage, ServerToClientMessage } from "./ws-protocol.js";

interface SocketState {
  roomId: string;
  userId: string;
}

function send(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function parseMessage(data: WebSocket.RawData): ClientToServerMessage | null {
  try {
    const parsed = JSON.parse(data.toString()) as Partial<ClientToServerMessage>;
    if (!parsed || typeof parsed.type !== "string") return null;
    return parsed as ClientToServerMessage;
  } catch {
    return null;
  }
}

export function attachRoomWebSocketServer(
  wss: WebSocketServer,
  roomManager: RoomManager,
  db: SocialDb,
): void {
  const socketState = new Map<WebSocket, SocketState>();
  const roomSockets = new Map<string, Set<WebSocket>>();

  function socketsForRoom(roomId: string): Set<WebSocket> {
    let sockets = roomSockets.get(roomId);
    if (!sockets) {
      sockets = new Set();
      roomSockets.set(roomId, sockets);
    }
    return sockets;
  }

  function broadcast(roomId: string, message: ServerToClientMessage, except?: WebSocket): void {
    const sockets = roomSockets.get(roomId);
    if (!sockets) return;
    for (const socket of sockets) {
      if (socket !== except) send(socket, message);
    }
  }

  function failAndClose(ws: WebSocket, message: string): void {
    send(ws, { type: "error", message });
    ws.close(1008, message);
  }

  function handleSocketLeave(ws: WebSocket): void {
    const state = socketState.get(ws);
    if (!state) return;

    socketState.delete(ws);
    const sockets = roomSockets.get(state.roomId);
    sockets?.delete(ws);
    if (sockets?.size === 0) roomSockets.delete(state.roomId);

    const result = roomManager.leave(state.roomId, state.userId);
    if (!result.ok) return;
    broadcast(state.roomId, {
      type: "member_left",
      userId: state.userId,
      ...(result.newOwnerId ? { newOwnerId: result.newOwnerId } : {}),
    });
  }

  function handleJoin(ws: WebSocket, message: ClientToServerMessage): void {
    if (message.type !== "join") {
      failAndClose(ws, "first message must be join");
      return;
    }

    const user = verifyToken(db, message.token);
    if (!user) {
      failAndClose(ws, "invalid token");
      return;
    }

    const room = roomManager.get(message.roomId);
    if (!room) {
      failAndClose(ws, "room not found");
      return;
    }

    const member = room.members.find((candidate) => candidate.userId === user.id);
    if (!member) {
      failAndClose(ws, "user is not a room member");
      return;
    }

    socketState.set(ws, { roomId: room.id, userId: user.id });
    socketsForRoom(room.id).add(ws);
    send(ws, { type: "room_state", room: toRoomSnapshot(room) });
    broadcast(
      room.id,
      { type: "member_joined", member: { userId: member.userId, username: member.username } },
      ws,
    );
  }

  function handleReady(ws: WebSocket, state: SocketState, message: ClientToServerMessage): void {
    if (message.type !== "ready") return;
    const room = roomManager.setReady(state.roomId, state.userId, Boolean(message.ready));
    if (!room) {
      failAndClose(ws, "room not found");
      return;
    }
    broadcast(state.roomId, { type: "ready_changed", userId: state.userId, ready: Boolean(message.ready) });
  }

  function handleStart(ws: WebSocket, state: SocketState): void {
    const room = roomManager.get(state.roomId);
    if (!room) {
      failAndClose(ws, "room not found");
      return;
    }
    if (room.ownerId !== state.userId) {
      send(ws, { type: "error", message: "only owner can start" });
      return;
    }
    if (!canStart(room)) {
      send(ws, { type: "error", message: "room is not ready" });
      return;
    }
    const started = roomManager.start(state.roomId);
    if (!started) {
      failAndClose(ws, "room not found");
      return;
    }
    broadcast(state.roomId, { type: "game_start", levelId: started.levelId });
  }

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      const message = parseMessage(data);
      if (!message) {
        failAndClose(ws, "invalid message");
        return;
      }

      const state = socketState.get(ws);
      if (!state) {
        handleJoin(ws, message);
        return;
      }

      switch (message.type) {
        case "join":
          send(ws, { type: "error", message: "already joined" });
          break;
        case "ready":
          handleReady(ws, state, message);
          break;
        case "leave":
          handleSocketLeave(ws);
          ws.close(1000, "left room");
          break;
        case "start":
          handleStart(ws, state);
          break;
      }
    });

    ws.on("close", () => {
      handleSocketLeave(ws);
    });
  });
}
