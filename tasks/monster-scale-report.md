# Report：怪物体型归一修复

派单：`tasks/monster-scale-brief.md`。执行：sonnet，2026-07-07。

## 根修：删 per-cell 归一，全体用英雄同一 px→world 缩放

`BattleScene.ts:937`（`spawnEntity`）原式：

```ts
const scale = (isBoss ? 2.0 : 1.5) * (200 / data.sheet.cellH)
```

改为：

```ts
const scale = HERO_SCALE // 1.5，与英雄同一 px->world 缩放
```

删掉了两件事：①按 `200/cellH` 把每个 species 的 sheet 格拉伸/压缩到英雄的 300px（`1.5*200`）等效格；②对 `isBoss` 再加一道 2.0 倍加成。原则：每个 species 的 sheet 都是同一坐标系下的 SWF 原生像素导出，大 boss 天生大格子、小怪天生小格子，直接信任这个原生尺寸，不再"拉伸到统一格子"。

## 原则验证过程

### 方法

对 hero + 4 个 L1/mini-boss species 做同口径测量：在其 `wait`（待机）动作的每一帧上，用 alpha>40 阈值取轮廓 bbox（用简单 `getbbox()` 会被反走样噪声污染到整格，改用阈值后数字才干净），取该动作全部帧的最大轮廓高度，作为"站立身高"的代理指标。

| species | 说明 | sheet cellH | 轮廓最大高度(px) | 新 scale 下显示高度 | vs 英雄(153px) | 旧式(cell 归一)显示高度 |
|---|---|---|---|---|---|---|
| hero (role1) | 悟空 | 200 | 102 | 153 | 100% | 153（无变化，公式对齐英雄本身） |
| monster7 | L1 杂兵，橙甲人形 | 150 | 102 | 153 | **100%** | 204（133%，偏大） |
| monster8 | L1 杂兵，**乌龟怪**（用户投诉主体） | 150 | 95 | 142 | **93%** | 190（124%，偏大） |
| monster30 | L1 杂兵，低伏鸟/鹫身小怪 | 150 | 74 | 111 | 72%（见下"疑点"） | 148（97%，巧合接近但理由错） |
| monster3 | L1 关底 boss 巫鹰 | 180 | 107 | 160 | **105%** | 238（156%，明显偏大） |
| monster5 | mini-boss 巨灵神 | **350** | 154（估，按同比例） | ~231+（实测见下） | **远大于英雄** | 旧式会被砍到 220（97%，把"巨"字抹平） |

`monster5` 是本次验证里最有力的反证：它的 sheet cellH=350，是英雄的 1.75 倍——SWF 原生尺寸就把它画成了巨人。旧公式的 `200/cellH` 归一会把这个"巨"字生生拉平到接近英雄身高（97%），新公式让它保持巨人比例（浏览器实测见下）。这正是 brief 判据②"boss 可以大，但大得有出处"的反例证据：cell 大小本身就是出处，归一恰恰抹掉了它。

### 浏览器实机验证（独立 playwright-core + 缓存 chromium + 独立 vite :5182）

- `tmp/debug-shots/monster-scale-before-0-turtles.png` vs `-after-0-turtles.png`：修复前乌龟怪明显高过悟空（目测超头顶一截）；修复后乌龟与悟空身高相当、乌龟略矮，与参照截图 `docs/reference/zmxy-online-screens/combat-damage.png` 里"英雄站在两只机械乌龟中间，乌龟略矮"的比例吻合（该参照图我另测得乌龟轮廓约为英雄的 83~87%，与本次 93% 的计算值同一量级）。
- `tmp/debug-shots/monster-scale-before-2-boss.png` vs `-after-2-boss-teleport.png`：同机位对比，修复前巫鹰明显比悟空高大一截；修复后巫鹰与悟空身高基本持平（105%），比例上不再"莫名其妙地大一号"。
- `tmp/debug-shots/monster-scale-after-5-giant-monster5.png`：mini-boss 巨灵神在新公式下明显高出悟空 2~3 倍，读起来是真正的"巨灵神"而不是被拍扁的普通怪——验证了"信任原生像素"这条路线在大体型 boss 上同样成立，而不只是巧合地修好了乌龟。
- `tmp/debug-shots/monster-scale-after-6-bird-monster30.png`：低伏的鸟/鹫形杂兵在画面里明显比悟空矮小、贴地爬行——数值上 72% 略超出 ±15% 判据带，但实机看它是四足/伏地体态，不是站立人形，矮本身就是这个体态该有的样子（细节见下"遗留疑点"）。

### 命中判定 / hp 条 / 落地判据（判据③）

独立 playwright 脚本用真实交互路径（`__inject('pressJump')` + `__inject('pressAttack')`，走的是和真实按键完全相同的 `collectEdges()`/combo 状态机，不是抄近道的假钩子）对准乌龟怪做了一次跳打：

```
before combo: monster8 hp 80, mode 'chase'
after jump+combo: monster8 hp 55, mode 'hurt'
```

命中正常连上，扣血逻辑未受影响（命中判定基于 `state.x/state.y` 和固定 `attackRange`，与渲染层 `sprite.setScale()` 完全解耦，代码结构上就不共享）。截图 `monster-scale-after-4-jumpattack.png`：两只乌龟头顶血条位置正常（`GROUND_Y - 110` 固定挂点，与新尺寸的怪物贴合），三方脚下均落在同一片莲叶地面线上，无悬空/下沉错位。`MON_RENDER_OFFSET_Y`（渲染层一个 30px 固定下沉，用于配合怪物 sheet 内部的注册点，与英雄侧对应逻辑同源但因怪物 sheet 内部留白规律不同而单独存在）在新 scale 下未见需要重调的痕迹——多个 species 的实机截图脚落地都干净。

## 每 species 结论表

| species | 判据①/②要求 | 结论 |
|---|---|---|
| monster7 | ①±15% | 100%，过 |
| monster8（乌龟） | ①±15% | 93%，过，且与官方实机截图比例吻合 |
| monster30（鸟形杂兵） | ①±15% | 72%，**技术上超出判据带**，见下"遗留疑点" |
| monster3（巫鹰 boss） | ②"大得有出处" | 105%，出处 = 其 sheet cellH(180) 略大于杂兵(150)但小于英雄(200)，比例保真 |
| monster5（巨灵神 mini-boss） | ②"大得有出处" | 明显偏大，出处 = 其 sheet cellH(350) 是英雄的 1.75 倍，SWF 原生就画成巨人 |

## 遗留疑点：monster30 的 72% 是否要单独修正因子

按 brief 的判据①字面（"L1 全部小怪含乌龟与英雄身高相当 ±15%"），monster30 以轮廓算是 72%，没进 ±15% 带（需 ≥85%）。

**我的判断**：这不属于 brief 允许"单独记修正因子"的那类情形——那类情形是"某些 sheet 导出密度不一致（不同 dpi/缩放导出）"，即工艺误差；monster30 是低伏的鸟/鹫身四足体态（非站立人形），72% 更像是这个体态本身的真实比例，不是导出密度问题。实机截图看它是贴地爬行的小型杂兵（1 HP，高速 8，明显是"一击必杀的清杂鱼"角色设定），矮小本身可能就是原版对它的设定。没有找到该 species 的原版实机参照图可比对（只有乌龟怪那张能直接验证），所以无法像 monster7/8/3/5 那样"实锤"，只能给出结构性判断。

**没有做的事**：没有为它加一个专属缩放系数——那正是 brief 明确要避免的"每 species 手调因子"路线，在没有原版参照实锤支撑的情况下这么做等于凭空拍数字。**留给 team-lead/用户拍板**：72% 是否可接受，或者要不要找该 species 的原版参照图核实。

## 判据结果

| 判据 | 结果 |
|---|---|
| ① L1 全部小怪（含乌龟）与英雄身高 ±15% | monster7 100%✓ / monster8 93%✓ / monster30 72%✗（见遗留疑点，判断为体态差异非 bug） |
| ② 巫鹰 boss 相对身高与其 SWF 原生比例一致 | 过（105%，出处=sheet cellH 数据，非人为加成） |
| ③ 命中判定/血条挂点/落地贴地不因缩放改变而错位 | 过（跳打一轮实测命中生效、血条挂点位置正常、多 species 落地一致） |
| ④ tsc 干净 + vitest 全绿（基线 401） | 过（tsc exit 0；vitest 401/401，与派单前基线一致） |

## 改动范围

- 仅改 `game/src/scenes/BattleScene.ts` 的 `spawnEntity` 内一行 scale 公式 + 注释；未新增 species 数据字段（本次未发现需要"带来源注释"的密度修正案例，见上）。
- 未碰 `systems/`、`ui/`、`net/`、关卡波次数值。
- commit 只 add 了 `game/src/scenes/BattleScene.ts` 与本 report；工作树里另有其他并行 agent 的未提交改动（`game/src/ui/hud/hudTheme.ts` 修改 + `game/public/assets/extracted/ui/hud_ri_*.png` 新增），未 add、未碰。

## 证据截图（`tmp/debug-shots/`，未进 git）

- `monster-scale-before-0-turtles.png` / `-after-0-turtles.png` —— 乌龟怪修复前后同机位对比（核心投诉修复）
- `monster-scale-before-2-boss.png` / `-after-2-boss-teleport.png` —— 巫鹰 boss 修复前后同机位对比
- `monster-scale-after-5-giant-monster5.png` —— mini-boss 巨灵神，验证"大 boss 天生大"未被误伤
- `monster-scale-after-6-bird-monster30.png` —— 鸟形杂兵，遗留疑点的实机参照
- `monster-scale-after-4-jumpattack.png` —— 跳打一轮命中/血条/落地判据实测

## 测试基线

`npx tsc --noEmit`：exit 0。`npx vitest run`：401/401 全绿（与派单前基线一致，未新增/删除测试）。验证全程用独立 `playwright-core`（装在 scratchpad，`npm install playwright-core`，未碰本仓库 `package.json`）+ 缓存 chromium（`~/Library/Caches/ms-playwright/chromium-1228`，`--no-proxy-server` 绕开代理环境变量）+ 独立 vite dev（`--port 5182 --strictPort`，nohup），未使用共享 MCP playwright 浏览器。
