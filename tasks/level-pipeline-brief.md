# 任务书：关卡流水线 team（你是主理人，可自派 worker agent）

## 目标
把"一张图"变成"一串难度递增的关卡链"（gameplay-anatomy §5 两大缺口之一）。三阶段：**试点第 2 关端到端 → 沉淀可复用 playbook → 自派 worker 并行铺第 3、4 关**。

## 必读
- `docs/research/asset-pipeline-notes.md` — FFDec 命令族全部实测过：位图表 image 导出、切帧脚本、动作表从主逻辑 SWF 反编译提取（ROLE1 22 动作已趟通，怪物同法）
- `game/src/systems/level.ts` — 波次/停点/BOSS 状态机已移植好，你的关卡数据要符合它的 WaveSpec/停点接口。**接口不够用时报告主会话，不要自己改它**
- `vendor/kagami-phaser/docs/`（含 FFDEC_EXTRACTION_GUIDE.md + 逆向文档，波次数值对表用）
- 素材源：`vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/`（34 个解密 SWF）；主逻辑 SWF（AS3 未加密，Boss 机制真源）：`.../造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf`
- 数值数据源可选：github XinTianyu-Sky/ZMXY 有 57 怪物/10 关波次 JSON（未 clone，需要就走代理 127.0.0.1:7897 拉到 vendor/，不进 git）

## 阶段 1：试点第 2 关（你亲自做，摸清全链路）
产出：
- 场景素材（背景层）+ 本关全部怪物 spritesheet + 动作表 JSON → 落 `game/assets/`（先 `git ls-files` 看现有 extracted 素材入库模式，跟随之）
- `game/src/data/levels/` 本关波次/停点/Boss spec（符合 level.ts 接口）+ vitest 模拟通关测试
- Boss：动作表 + 基础数值必做；专属机制从主逻辑 SWF 反编译逆向，做不完标 TODO-verify 不阻塞，但排查过程记下来
判据：vitest 波次模拟通关全绿；最小 HTML 测试页（不动 game/src/scenes/！可放 tools/ 或独立 html）播放本关至少 2 只怪的动画，截图落 tmp/debug-shots/。

## 阶段 2：沉淀 playbook
`docs/playbooks/level-port-playbook.md`：让任意冷启动 agent 照做能接一关。含：SWF→关卡包定位方法、导出/切帧/动作表命令模板、波次数据 schema、Boss 机制排查路径、验收清单、已知坑（如 Monster7 hit2 指向不存在贴图行这类原版数据 bug 的处理方式）。

## 阶段 3：自派 worker 横铺
用 Agent 工具派 sonnet worker（每 worker 一关，文件集按关卡目录天然不相交），你逐个验收（跑测试+看截图，不信 worker 自述）。黑客松内目标：第 3、4 关落地；管线顺的话继续铺。

## 边界与纪律
- 你和 worker 只动：`game/assets/`、`game/src/data/`、`docs/playbooks/`、`tools/`（新脚本）、tmp/。绝不动 game/src/scenes/、systems/、net/、ui/、agent-server/（多个 team 并行中）。
- commit 只 add 自己文件，绝不 git add -A；遇 index.lock 重试。不 push。
- 原版素材本体不进 git 的部分遵循现有 .gitignore 约定；加工产物跟随 session1 已有入库模式。
- 每关完成在 `tasks/level-pipeline-report.md` 追加一节（关号、素材清单、数值出处、Boss 机制状态、遗留）。

完成后返回：各阶段判据通过情况 + playbook 路径 + 各关 commit hash + Boss 逆向发现摘要。