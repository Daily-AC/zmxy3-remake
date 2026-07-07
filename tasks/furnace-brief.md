# 任务书：炼丹炉合成系统（纯逻辑 + 炼器协议，不接场景）

## 目标
补上五根"骨"里唯一空白：炼丹炉合成中枢（`docs/research/gameplay-anatomy.md` §5，必读）。本棒只做**纯逻辑 + 协议 + agent-server 侧**，场景/UI 接线是后面串行棒（BattleScene 被另一 agent 独占，你**绝不能动 `game/src/scenes/`、`game/src/ui/`**）。

## 设计拍板（已定，不要重新设计）
核心流：怪掉材料 → 玩家找老君对话，用自然语言描述想要的装备并选择消耗哪些材料 → agent-server 炼器（已有受限 DSL + 硬 clamp 沙箱）现场生成独一无二装备 → 返回游戏侧校验入背包 → 可穿。

关键原则：**游戏侧不信任服务端返回**。材料价值决定属性预算，游戏侧对返回装备再做一次硬 clamp/校验，超预算直接拒收。

## 实现范围
1. `game/src/systems/furnace.ts` + 单测：
   - 材料定义（复用/扩展 `systems/items.ts` 的物品体系；掉落表接入用现有 dropRoll 接口，给出材料掉落配置但不改怪物逻辑）
   - 材料 → 属性预算函数（材料稀有度/数量 → atk/def/proc 上限）
   - 炼制请求构造（材料清单 + 玩家自然语言描述 → 协议消息）
   - 返回装备校验：schema 校验 + 预算 clamp + 非法字段剔除，产出合法 Equipment（兼容 `systems/equipment.ts` 现有类型）
   - 材料消耗事务：请求发出即锁定，成功消耗、失败/超时归还
2. `game/src/net/` WS 协议扩展：炼器请求/响应消息类型（跟现有 laojun 对话通道并存，看现有消息结构保持风格一致）
3. `agent-server/` 侧：接收炼制请求 → 调用已有炼器能力（受限 DSL + clamp 沙箱已存在，先读懂再复用）→ 返回装备 JSON。人设：太上老君炼宝时的台词一并返回（一两句，引用玩家给的材料和描述）。
4. agent-server 侧单测/自测：至少一条端到端 mock provider 测试（不打真 LLM 也能测协议与 clamp）。

## 约束
- 纯逻辑进 systems/ 可单测；协议类型两端共享定义（看 repo 现有做法，net/ 里可能已有消息类型文件）。
- agent-server 现跑在 home（wss://zm-dev.qmledmq.cn:8443），你只改代码不管部署；本地 `node` 起 agent-server 自测即可。
- DeepSeek key 走环境变量，配置里绝不落 key 值。

## 验收判据
1. `cd game && npx vitest run` 全绿（现有 126 不许挂，furnace 带完整单测：预算 clamp、超预算拒收、失败归还材料至少各一条）。
2. agent-server 本地起服 + mock provider：发一条炼制请求 → 收到合法装备响应 → 游戏侧校验通过，脚本或测试可复现。
3. 写 `tasks/furnace-report.md`：协议消息格式、预算公式、clamp 规则、场景接线需要的接口清单（给下一棒）。

## 提交
完成自测后 commit（不 push），message 英文。
