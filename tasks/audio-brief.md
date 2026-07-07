# 任务书（续单）：原版音频全量提取 + 声音清单

## 目标
把原版 BGM 和音效变成游戏可用的资产 + 触发映射表。音频是"像小时候"体验的一半，目前完全空白。接线（真正播放）是后面串行棒，你只做资产 + 纯逻辑映射。

## 来源（按优先级）
1. `vendor/zmxy_res/.../out_res/Music.swf`（FFDec `-export sound`，命令风格参考 docs/research/asset-pipeline-notes.md；其他 SWF 里可能也埋有音效，扫一遍 `-export sound` 产出量）
2. github XinTianyu-Sky/ZMXY 有 84 个原版音频文件可作补充/对照（需要就走代理 127.0.0.1:7897 clone 到 vendor/，不进 git）

## 实现范围
1. 导出全部音频 → `game/assets/audio/`（入库模式跟随现有 assets 的 git 约定，先 `git ls-files game/assets | head` 确认）；文件名保留原符号名。
2. `game/assets/audio/MANIFEST.md`：每条音频的来源 SWF/符号名、时长、内容描述（听或按符号名推断，标注置信度）。
3. `game/src/data/soundMap.ts` + 单测：纯数据映射——游戏事件名（hit1..hit5/jump/pickup/levelup/die/respawn/bgm_level1/ui_click 等，对齐现有 systems 事件语义）→ 音频 key + 音量/循环参数。找不到对应原版音频的事件留 null 并在 MANIFEST 记缺口。
4. 给接线棒的接口清单写进 report（BattleScene/场景侧怎么消费 soundMap）。

## 纪律（多 team 并行，同前）
- 只动 `game/assets/audio/`、`game/src/data/soundMap.ts`（新文件）、tools/ 新脚本、tasks/audio-report.md、tmp/。绝不动 scenes/ systems/ net/ ui/ agent-server/。
- commit 只 add 自己文件，不 git add -A，遇 index.lock 重试，不 push。
- 音频属原版素材，如现有 .gitignore 约定素材不入库则只落本地 + MANIFEST 入库，报告里说明。

## 验收判据
1. 导出数量与 Music.swf 内符号数对得上（report 给对账数字）；抽样 3 条本地可播放（afplay 验证非损坏）。
2. vitest 全绿（soundMap 带最小单测：全部 key 指向存在的文件）。
3. `tasks/audio-report.md`：清单统计、缺口列表、接线接口。