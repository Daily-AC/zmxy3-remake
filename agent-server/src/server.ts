import { WebSocketServer, WebSocket } from "ws";
import type { InboundMessage, OutboundMessage } from "./types.js";
import { listNpcIds } from "./npc-registry.js";
import { recordWorldEvent } from "./npc-state.js";
import { askNpc } from "./brain.js";
import { forgeEquipment } from "./forge.js";

const PORT = Number(process.env.AGENT_SERVER_PORT ?? 5181);

function send(ws: WebSocket, msg: OutboundMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  console.log("[agent-server] client connected");
  send(ws, { type: "welcome", npcIds: listNpcIds() });

  ws.on("message", async (raw) => {
    let msg: InboundMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "invalid JSON" });
      return;
    }

    try {
      switch (msg.type) {
        case "hello": {
          send(ws, { type: "welcome", npcIds: listNpcIds() });
          break;
        }
        case "world_event": {
          recordWorldEvent(msg.kind, msg.data, msg.at);
          break;
        }
        case "player_say": {
          send(ws, { type: "npc_thinking", npcId: msg.npcId });
          let flavor = "";
          await askNpc(msg.npcId, msg.text, {
            onSay: (text) => {
              flavor = text;
              send(ws, { type: "npc_say", npcId: msg.npcId, text });
            },
            onGiveItem: (item) => send(ws, { type: "give_item", npcId: msg.npcId, item }),
            onSetGoal: (goal) => send(ws, { type: "set_goal", npcId: msg.npcId, goal }),
            onCraftItem: (item) => send(ws, { type: "craft_item", npcId: msg.npcId, item }),
            onCraftRecipe: (recipeId) => send(ws, { type: "craft_recipe", npcId: msg.npcId, recipeId, flavor }),
          }, { materials: msg.materials, soul: msg.soul });
          break;
        }
        case "craft_request": {
          try {
            const { item, flavor } = await forgeEquipment(msg);
            send(ws, {
              type: "craft_result",
              npcId: msg.npcId,
              requestId: msg.requestId,
              item,
              flavor,
            });
          } catch (err) {
            send(ws, {
              type: "craft_reject",
              npcId: msg.npcId,
              requestId: msg.requestId,
              reason: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }
        default: {
          const unknownType = (msg as { type?: string }).type ?? "(missing)";
          send(ws, { type: "error", message: `unknown message type: ${unknownType}` });
        }
      }
    } catch (err) {
      console.error("[agent-server] error handling message", err);
      send(ws, {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  ws.on("close", () => {
    console.log("[agent-server] client disconnected");
  });
});

console.log(`[agent-server] listening on ws://localhost:${PORT}`);
