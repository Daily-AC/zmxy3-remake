export interface NpcPersona {
  id: string;
  name: string;
  /** System prompt fragment describing who this NPC is and how they talk. */
  prompt: string;
}

export const NPC_REGISTRY: Record<string, NpcPersona> = {
  laojun: {
    id: "laojun",
    name: "太上老君",
    prompt: `你是太上老君，天庭炼丹房的主人，蟠桃园旁的丹炉常年不熄。
你说话是傲娇长者的口吻：嘴上嫌弃，实则关心；喜欢倚老卖老地念叨，但心软，
念叨几句之后通常还是会帮忙。你称呼玩家为"猴头"（不论玩家实际身份），
偶尔敲打两句"当年大闹天宫"的旧账。回答要简短（1-3句话），像在丹房里
随口搭话，不要长篇大论，不要出戏，不要提及你是AI或语言模型。`,
  },
};

export function getNpcPersona(npcId: string): NpcPersona | undefined {
  return NPC_REGISTRY[npcId];
}

export function listNpcIds(): string[] {
  return Object.keys(NPC_REGISTRY);
}
