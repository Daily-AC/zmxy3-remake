import http from "node:http";
import { pathToFileURL } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import {
  assertJwtSecret,
  createRequireAuth,
  getUserById,
  loginUser,
  registerUser,
  type AuthedRequest,
} from "./auth.js";
import { openSocialDb, type SocialDb } from "./db.js";
import {
  listFriends,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from "./friends.js";
import { isLevelId, RoomManager, toRoomSnapshot } from "./rooms.js";
import { attachRoomWebSocketServer } from "./ws-server.js";

export interface CreateServerOptions {
  dbPath?: string;
  db?: SocialDb;
  roomManager?: RoomManager;
}

export interface SocialServer {
  app: express.Express;
  httpServer: http.Server;
  db: SocialDb;
  roomManager: RoomManager;
  wss: WebSocketServer;
  close: () => Promise<void>;
}

function authed(req: express.Request): AuthedRequest {
  return req as AuthedRequest;
}

// Express 5's route param type widened to `string | string[]` (repeated
// segments produce an array); none of our routes use repeating params, so
// this just narrows back to the single value we actually get at runtime.
function param(req: express.Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0]! : value;
}

function closeHttpServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function closeWebSocketServer(wss: WebSocketServer): Promise<void> {
  for (const client of wss.clients) client.close();
  return new Promise((resolve, reject) => {
    wss.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function createServer(options: CreateServerOptions = {}): SocialServer {
  assertJwtSecret();

  const app = express();
  app.use(express.json());
  // Found 2026-07-09 during coop-shell browser verification: with zero CORS
  // handling, no browser page can ever complete register/login against this
  // server from a different origin -- and that's exactly how it's deployed
  // (game frontend on zaixu.qmledmq.cn, this API on
  // zm-dev.qmledmq.cn:8443/social). Node-script e2e tests never hit this
  // (CORS is a browser-only enforcement), which is why it went unnoticed.
  // `*` is safe here: auth is a bearer token in the Authorization header, not
  // a cookie, so there is no credentialed-CORS/CSRF concern that would call
  // for echoing a specific origin instead.
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const db = options.db ?? openSocialDb(options.dbPath);
  const ownsDb = options.db === undefined;
  const roomManager = options.roomManager ?? new RoomManager();
  const requireAuth = createRequireAuth(db);

  app.post("/auth/register", (req, res) => {
    const result = registerUser(db, req.body?.username, req.body?.password);
    if (!result.ok) {
      res.status(result.reason === "username_taken" ? 409 : 400).json({ error: result.reason });
      return;
    }
    res.status(201).json({ token: result.token, user: result.user });
  });

  app.post("/auth/login", (req, res) => {
    const result = loginUser(db, req.body?.username, req.body?.password);
    if (!result.ok) {
      res.status(result.reason === "invalid_credentials" ? 401 : 400).json({ error: result.reason });
      return;
    }
    res.status(200).json({ token: result.token, user: result.user });
  });

  app.get("/me", requireAuth, (req, res) => {
    const user = getUserById(db, authed(req).userId);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    res.status(200).json(user);
  });

  app.post("/friends/request", requireAuth, (req, res) => {
    const result = sendFriendRequest(db, authed(req).userId, req.body?.toUsername);
    if (!result.ok) {
      const status = result.reason === "to_user_not_found" ? 404 : result.reason === "self" ? 400 : 409;
      res.status(status).json({ error: result.reason });
      return;
    }
    res.status(201).json({ request: result.request });
  });

  app.post("/friends/:requestId/accept", requireAuth, (req, res) => {
    const result = respondToFriendRequest(db, param(req, "requestId"), authed(req).userId, true);
    if (!result.ok) {
      const status =
        result.reason === "request_not_found" ? 404 : result.reason === "not_recipient" ? 403 : 409;
      res.status(status).json({ error: result.reason });
      return;
    }
    res.status(200).json({ request: result.request });
  });

  app.post("/friends/:requestId/reject", requireAuth, (req, res) => {
    const result = respondToFriendRequest(db, param(req, "requestId"), authed(req).userId, false);
    if (!result.ok) {
      const status =
        result.reason === "request_not_found" ? 404 : result.reason === "not_recipient" ? 403 : 409;
      res.status(status).json({ error: result.reason });
      return;
    }
    res.status(200).json({ request: result.request });
  });

  app.delete("/friends/:userId", requireAuth, (req, res) => {
    const removed = removeFriend(db, authed(req).userId, param(req, "userId"));
    if (!removed) {
      res.status(404).json({ error: "not_friends" });
      return;
    }
    res.status(204).send();
  });

  app.get("/friends", requireAuth, (req, res) => {
    res.status(200).json(listFriends(db, authed(req).userId));
  });

  app.post("/rooms", requireAuth, (req, res) => {
    if (!isLevelId(req.body?.levelId)) {
      res.status(400).json({ error: "invalid_level" });
      return;
    }
    const user = getUserById(db, authed(req).userId);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const room = roomManager.create(req.body.levelId, { userId: user.id, username: user.username });
    res.status(201).json({ room: toRoomSnapshot(room) });
  });

  app.post("/rooms/:roomId/join", requireAuth, (req, res) => {
    const user = getUserById(db, authed(req).userId);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const result = roomManager.join(param(req, "roomId"), { userId: user.id, username: user.username });
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      res.status(status).json({ error: result.reason });
      return;
    }
    res.status(200).json({ room: toRoomSnapshot(result.room) });
  });

  app.post("/rooms/:roomId/leave", requireAuth, (req, res) => {
    const result = roomManager.leave(param(req, "roomId"), authed(req).userId);
    if (!result.ok) {
      res.status(result.reason === "not_found" ? 404 : 409).json({ error: result.reason });
      return;
    }
    res.status(200).json({ room: result.room ? toRoomSnapshot(result.room) : null });
  });

  app.get("/rooms/:roomId", requireAuth, (req, res) => {
    const room = roomManager.get(param(req, "roomId"));
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(200).json({ room: toRoomSnapshot(room) });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  attachRoomWebSocketServer(wss, roomManager, db);

  return {
    app,
    httpServer,
    db,
    roomManager,
    wss,
    async close() {
      await closeWebSocketServer(wss);
      await closeHttpServer(httpServer);
      if (ownsDb) db.close();
    },
  };
}

export async function startServer(
  port = Number(process.env.SOCIAL_SERVER_PORT || 5182),
  options: CreateServerOptions = {},
): Promise<SocialServer & { port: number; url: string }> {
  const social = createServer(options);
  await new Promise<void>((resolve) => {
    social.httpServer.listen(port, "127.0.0.1", () => resolve());
  });
  const address = social.httpServer.address();
  if (!address || typeof address === "string") throw new Error("failed to determine listen address");
  return {
    ...social,
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer()
    .then((social) => {
      console.log(`social-server listening on ${social.url}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
