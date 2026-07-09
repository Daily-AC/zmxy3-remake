# 任务书：L1 场景几何挖掘（sl11/sl12/sl13 平台与标记矩形 → JSON）

派发：2026-07-09 主会话 → codex。产出 report 写 `tasks/level1-geometry-report.md`。

## 背景

原版第一关（九重天）是三个子场景：sl11 纵向爬塔（bg11 1132×3051）→ sl12/sl13 横向卷轴（bg12/13 约 4890 宽）。当前移植版丢了全部空间结构。平台/墙/门的精确矩形在主逻辑 SWF 的场景 MovieClip 里，需要挖出来落成 JSON，供并行的引擎任务加载。

**碰撞架构（已核实，见 `tmp/re-level1/mainscripts/scripts/World/PhysicsWorld.as` 的 `addSubObj`）**：场景 MovieClip 的每个直接子 MovieClip，若其内部含特定命名的子实例，即为一块碰撞体/标记。已知标记名：`isWall`（实心墙，注意 rotation!=0 会 unshift）、`isThroughWall`、`isThroughUpButDownWall`、`isThroughDownButUpWall`（三种单向平台变体，语义读 PhysicsWorld 碰撞代码）、`noContinueGo`、`isTransferDoor`（子场景切换门）、`monsterDisapperaPoint`、`isHideWall`。**先通读 addSubObj 把全部标记名枚举完**，别只抄这份清单。

## 真源与工具（全部已就位，只读）

- 主 SWF：`vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/造梦西游3再续天庭0.72(最终版本)/打开我开始玩.swf`
- 场景符号 ID（已从 symbolclass 核实）：**sl11 = character 195，sl12 = 209，sl13 = 211**（`tmp/re-level1/symmain/symbols.csv` 有全表）
- 已导出的全量 AS3：`tmp/re-level1/mainscripts/scripts/`
- FFDec：`/opt/homebrew/opt/openjdk/bin/java -jar tools/ffdec/ffdec-cli.jar`；推荐 `-swf2xml` 拿 DefineSprite 时间轴 PlaceObject 矩阵 + DefineShape 的 ShapeBounds（bounds 是现成的，不用自己从 edges 算；注意 twips ÷20 = px）。XML 会很大，用流式/grep 处理，别整个读进上下文。
- 参照底图（已提取）：`game/public/assets/extracted/level1/bg11.png / bg12.png / bg13.png`

## 产出

1. `game/src/data/levels/level1-geometry.json`，schema 固定如下（引擎任务同款契约，不许改字段名）：

```json
{
  "meta": { "source": "打开我开始玩.swf DefineSprite 195/209/211", "units": "px (twips/20), original scene coords", "tool": "tools/extract-scene-geometry.*" },
  "subStages": [
    {
      "id": "sl11",
      "walls": [ { "type": "solid|through|throughUpButDown|throughDownButUp", "x": 0, "y": 0, "width": 0, "height": 0, "rotation": 0 } ],
      "transferDoors": [ { "x": 0, "y": 0, "width": 0, "height": 0 } ],
      "markers": [ { "name": "<原始标记名>", "x": 0, "y": 0, "width": 0, "height": 0 } ]
    }
  ]
}
```

   - `x,y` = 矩形左上角，场景坐标系原样保留（爬塔段 y 为负往上，别归一化、别翻转）。
   - walls 四型对应四个标记名；其余标记全进 `markers` 兜底数组，一个都不丢。
2. 提取脚本进 `tools/`（node 或 python 均可，可复用到 L2）。
3. **验收 overlay**：脚本把矩形按类型分色画在对应 bg 底图上，输出 `tmp/geometry-overlay-sl11.png / sl12 / sl13`（爬塔段图高 3051，直接全高出图）。

## 判据（全部满足才算完）

- [ ] JSON 通过自写 schema 校验脚本；三个 subStage 都非空。
- [ ] sl11 至少含多块 through 型平台（爬塔阶梯）；若一块都没有说明挖错了层级，回去查。
- [ ] 交叉验证写进 report：AS3 `StageListener11.callBoss()` 在 (750, -2050) 刷巫鹰、英雄爬到 y≤-1900 触发——Boss 落点附近必须存在可站立平台矩形，把那块平台的坐标列出来。
- [ ] overlay 三张图人眼可辨（矩形与背景图的视觉平台大致贴合；终审由主会话做，你只保证图生成正确）。
- [ ] report 记录：每个子场景的 wall 数量分型统计、发现的全部标记名清单、任何反常（如 rotation!=0 的墙）。

## 边界与纪律

- 只准写：`game/src/data/levels/level1-geometry.json`、`tools/`（新文件）、`tmp/`、`tasks/level1-geometry-report.md`。
- **禁止**：动 `game/src/` 其他任何文件；npm install / 任何网络访问（沙箱无出网，装包必死）；起 dev server。
- vendor/ 与 tmp/re-level1/ 只读。
- commit 只 add 自己的文件（显式路径），不 push。遇 index.lock 重试。
