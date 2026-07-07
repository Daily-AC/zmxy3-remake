// Shared LLM plumbing used by both the conversational brain (brain.ts) and the
// structured furnace forge (forge.ts). Extracted here so both share ONE lazily
// spawned `opencode serve` subprocess for the process lifetime — spawning a
// second would waste a port and a model connection.

import { createOpencode } from "@opencode-ai/sdk";

export const OPENCODE_MODEL = {
  providerID: process.env.NPC_OPENCODE_PROVIDER_ID ?? "deepseek",
  modelID: process.env.NPC_OPENCODE_MODEL_ID ?? "deepseek-v4-flash",
};

let opencodeInstance: ReturnType<typeof createOpencode> | undefined;

/** Lazily spawns one `opencode serve` subprocess for the lifetime of this
 * process, shared across all NPCs/turns/forges. Cleaned up on exit. */
export function getOpencode(): ReturnType<typeof createOpencode> {
  if (!opencodeInstance) {
    opencodeInstance = createOpencode({ hostname: "127.0.0.1" }).then((oc) => {
      const cleanup = () => oc.server.close();
      process.once("exit", cleanup);
      process.once("SIGINT", () => {
        cleanup();
        process.exit(0);
      });
      process.once("SIGTERM", () => {
        cleanup();
        process.exit(0);
      });
      return oc;
    });
  }
  return opencodeInstance;
}

export function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : text;
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
