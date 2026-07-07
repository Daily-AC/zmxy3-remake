# 音频提取 + 声音映射：验收报告

## 对账数字

`Music.swf`（唯一含音频的资源包）导出 85 个 `DefineSound` 相关标签：
- 84 个具名符号（chid 1–84，`-export symbolclass` 逐一核对过）
- 1 个 `SoundStreamHead2`（cid -1，无类名绑定，44 字节空 WAV 头零数据，非真实音效）

**84/84 全部导出、全部已入库 `game/public/assets/audio/`，无缺口、无多余、无重复。**
这份提取实际是上一个 session 就做完的（提交 `ca828dd`），本轮任务对它做了逐符号
（`symbols.csv`）+ 逐 SWF（对全部 34 个 out_res 包跑 `-dumpSWF` 扫 `DefineSound`/
`SoundStreamHead`/`StartSound`）的独立复核，确认没有漏掉的音效源，也确认没有其他包
埋着额外音效——Music.swf 就是唯一来源。本轮新增的是缺失的三件交付物：
`MANIFEST.md`、`game/src/data/soundMap.ts` + 单测、这份报告。

未使用 XinTianyu-Sky/ZMXY 的补充音频源（任务书列的备选来源）：该仓库的 84 个音频文件
与本清单同源（同一游戏同一批音效），Music.swf 直接导出已 100% 覆盖，没有需要补充或
交叉核对的缺口，引入第二个来源纯属多余的网络操作。

## 抽样播放验证

```
afinfo game/public/assets/audio/bg0.mp3                 # 123.9s，可读出正确时长
afinfo game/public/assets/audio/Role1_hit1AndHit2.mp3   # 0.57s
afinfo game/public/assets/audio/pickup.mp3              # 0.62s
afplay game/public/assets/audio/pickup.mp3              # 播放到自然结束，无报错
afplay game/public/assets/audio/Role1_hit1AndHit2.mp3   # 播放到自然结束，无报错
afplay game/public/assets/audio/bg0.mp3                 # 播放 2s 后手动中止，无解码错误
```

三条样本均确认非损坏、可正常解码播放。

## 缺口列表

游戏当前有事件语义、但原版 84 个音效里**确实没有**对应素材（已核实，非漏找）：

| 事件 | 说明 |
|---|---|
| `wait`/`wait2`/`walk`/`run`（待机/移动循环） | 原版没有脚步声/待机环境音 |
| `jump3`（二段跳/落地） | 只有起跳一个音效符号，落地/二段跳没有独立素材 |
| `levelup`（升级） | ProgressionSystem 是本项目移植+改造系统，原版没有对应"叮"声 |
| `respawn`（复活） | HeroCombatSystem 的复活是本项目四块原创之一（CLAUDE.md 已记），原版没有复活音效 |
| `ui_click`（通用 UI 点击） | 扫描确认 backpack1.swf/Common1.swf 等 UI 包本身没有 `DefineSound` 标签，原版 UI 交互本来就是静音的 |

以上在 `soundMap.ts` 里都是显式 `null`（不是缺 key），并在 `MANIFEST.md`"已知缺口"一节
逐条写明依据。

**非缺口，只是暂未消费**：`Role2_*`/`Role3_*`/`Role4_*`（唐僧/八戒/沙僧）系列共 57 个
文件已完整入库、已在 MANIFEST 归档，只是 `soundMap.ts` 暂时只映射 Role1（悟空，当前
唯一可玩角色）。未来角色切换上线时直接扩表即可，不需要重新提取。

## 接线棒的接口清单（给下一棒）

`game/src/data/soundMap.ts` 导出：

```ts
interface SoundDef { key: string; volume: number; loop: boolean }

HERO_ACTION_SOUND: Record<string, SoundDef | null>   // 悟空 action 名 -> sfx
EVENT_SOUND:       Record<string, SoundDef | null>   // 跨场景事件 -> sfx/bgm

resolveHeroActionSound(action: string): SoundDef | null
resolveEventSound(event: string): SoundDef | null
```

`key` 字段直接对应 `game/public/assets/audio/<key>.mp3`（不带扩展名/路径），跟
`BattleScene.ts` 现有 `this.load.audio(key, 'assets/audio/${file}')` 的相对路径约定
一致，接线时只需要：

1. **preload 阶段**：遍历 `HERO_ACTION_SOUND` + `EVENT_SOUND` 里所有非 null 的
   `.key`，去重后批量 `this.load.audio(def.key, \`assets/audio/${def.key}.mp3\`)`
   （目前 `BattleScene.ts:202-213` 是手写的一个 7 条目小字典，只覆盖
   `bgm/hit12/hit34/hit5/heroJump/monHurt/pickup` 这几个已经在玩的动作；换成遍历
   `soundMap` 之后可以覆盖到 hit6-hit14 这些技能音效，目前技能音效完全没声音）。
2. **播放时机**：
   - 悟空动作触发时：`resolveHeroActionSound(actionName)` 拿到 `SoundDef` 后
     `this.sound.play(def.key, { volume: def.volume })`（`playSfx` 已有这个签名，
     直接复用）。
   - 跨场景事件（拾取/怪物受击/BGM/结算）：`resolveEventSound(eventName)`，
     `loop: true` 的条目（目前只有 `bgm_level1`）要走 `this.sound.add(key, {loop:true,
     volume}).play()` 而不是 `this.sound.play()`（一次性播放 API 不认 loop）。
3. **两套系统目前是分离的**：`HERO_ACTION_SOUND` 的 key 直接是 `heroSkill.ts`/
   `combo.ts`/`jump.ts` 里已经在用的 `actionName` 字面量（`hit1`..`hit14` 各变体、
   `jump1`/`jump2`/`jump3`、`hurt`、`dead`），不需要额外做名字翻译层——现有系统吐出
   什么字符串，直接拿去查表即可。`EVENT_SOUND` 的 key
   （`pickup`/`monster_hurt`/`bgm_level1`/`stage_clear`/`game_over`）是本次新定义的，
   跟具体系统事件类型字符串没有天然对应（LevelSystem 用函数调用
   `isLevelCleared()`/`isCampaignComplete()` 判断而不是发事件字符串），接线时需要
   在调用点手动决定何时触发这几个 key，不是简单的字符串透传。
4. **不要改** `scenes/BattleScene.ts` 里现有的 7 条目手写字典和 `playSfx`/
   `startAudioOnFirstInput` ——那是当前正在跑的最小闭环，接线棒的工作是**替换/扩展**
   它去覆盖 `soundMap.ts` 的全集，不是本次任务范围（本次只交付纯数据层）。

## 纪律确认

只新增了 `game/public/assets/audio/MANIFEST.md`、`game/src/data/soundMap.ts`、
`game/tests/soundMap.test.ts`、这份报告、`tmp/audio-durations.tsv`（本地分析用，
gitignored）。未触碰 `scenes/`、`systems/`、`ui/`、`net/`、`agent-server/`。
`vitest run`: 24 files / 204 tests 全绿（含新增 5 个 soundMap 用例）。

`npx tsc --noEmit` 目前不干净，但错误全部在 `game/src/ui/DialogueBox.ts`（其他并行
team 的在途改动，未提交），与本任务的文件无关，不是本次改动引入的。
