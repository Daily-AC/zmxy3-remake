# 任务书：游戏壳 — 登录/选人/存档槽（"像小时候 4399"的门面）

## 目标
复刻原版"打开游戏→登录→选存档→选人→开干→保存"的无感体验壳。本地单机：登录界面是**情怀壳**（本地假登录/直接进入，不做真账号），存档走已有 `systems/save.ts`（版本化 v1 + 迁移）。

## 实现范围
1. 新场景（全部新文件）：主菜单/登录场景 → 存档槽选择（3 槽：新建/继续/删除，显示等级和游戏时间摘要）→ 选人场景（悟空可选；唐僧/八戒/沙僧立绘灰显"敬请期待"，素材已有四角色）→ 进入 BattleScene。
2. 存档接线：save.ts 读写 localStorage（槽位 key 设计写进 report）；从 BattleScene 返回主菜单的入口留接口（发事件/回调），**不直接改 BattleScene**——把需要 BattleScene 配合的接口清单写进 report 交给集成棒。
3. 美术：优先从 out_res 原版 SWF 挖真素材（登录/主菜单/Loading 相关 SWF，方法照 `docs/research/asset-pipeline-notes.md` FFDec 命令族）；挖不到的用已提取 UI 素材（`git ls-files` 找 ui 素材和 MANIFEST）+ 已确立的水墨 DNA（笔触边框+深棕木质+橙黄描边按钮）。
4. Phaser 4（非 v3），渲染 API 先查 v4 差异。

## 边界与纪律（多 team 并行，严守）
- 你只新增文件：`game/src/scenes/` 下新场景文件（**绝不碰 BattleScene.ts**）、`game/src/ui/` 下新增子目录/新文件（不改现有 ui 文件）、存档槽纯逻辑（systems/ 新文件如 saveSlots.ts，带单测）。
- main.ts：只做最小场景注册改动；commit 前若见他人改动 main.ts，保留双方。
- commit 只 add 自己文件，绝不 git add -A；遇 index.lock 重试。不 push。

## 验收判据
1. vitest 全绿（现有不许挂，槽位逻辑带单测）。
2. 浏览器真实走通并截图落 tmp/debug-shots/：主菜单 → 新建存档槽 → 选悟空 → 进战斗场景；刷新页面 → 继续存档槽能读回。
3. 写 `tasks/meta-shell-report.md`：场景流转图、存档槽 key 设计、需 BattleScene 配合的接口清单、素材来源。

完成后返回：判据逐条通过情况 + commit hash + 遗留问题。