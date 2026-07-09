# 任务书：保真 B 棒——战斗场景表现层（bg11 对位/阶梯/乌鸦渲染/掉落样式/SLZ/技能入口）

派发：2026-07-09 主会话 → codex。report 写 `tasks/fidelity-b-visual-report.md`。**截止倒计时中，按序做完一件 commit 一件，做不完的诚实留档。**

## 产权（与并行 C 棒严格互斥）

可写：`game/src/scenes/BattleScene.ts`、`game/src/scenes/SkillTreeScene.ts`、`game/src/ui/hud/SkillBarHud.ts`、`game/src/data/monsters/monster30.json`、`game/public/assets/extracted/`（新增文件）、`game/tests/`、`tools/`（新脚本）、`tmp/`、本 report。
**禁碰**：`game/src/ui/hud/BackpackWindow.ts`/`FurnacePanel.ts`（C 棒产权）、`game/src/systems/`（刚合入的 A 棒机制，渲染需要的钩子已存在，若缺接口停手写 report）。
基线：master=195c8b6，全量 524 过/1 跳过 + tsc 净。禁 npm install/联网/dev server（vitest 直接跑）。

## 六件事（按优先级）

1. **bg11 世界对位 + 阶梯可视**：把 bg11（1132×3051）按原版场景坐标铺进爬塔世界——几何数据 `game/src/data/levels/level1-geometry.json` 与 bg11 同源同坐标系（走 twips/20，场景 y 负向上；对位规则=渲染坐标直等场景坐标，参考 climb-engine 的映射：boss(750,-2050)/地面 y≈400）。AS3 里 bg 放置 x=-20（BaseGameSence 构造）。判据：①英雄站世界地面时相机画面=bg11 底部区域；爬到顶=宫殿区，塔顶平台与宫殿地面图案重合（全屏截图三张：底/中/顶）；②把 geometry 平台矩形开发态描边叠加截一张图（F1 调试层即可），主会话终审对位。**中段云海区若原画无阶梯贴图**：不发明贴图，先给平台加淡水墨云影可视化（透明度低、Adapted 注释、report 记待用户翻案）。
2. **悟空半腿出画**：爬塔模式下英雄贴屏幕底边。修相机 follow 边界/deadzone，使地面态英雄完整可见且底部留出原版比例的地面空间（对照 floorBg1 期的构图）。判据：地面态截图英雄全身+脚下有地面层。
3. **乌鸦渲染尺寸+灰色矩形蒙版**：对 `Monster30.as` 的 `initBBDC`（cell 尺寸/offset 逐字）核 `monster30.json`，修 sheet 网格；灰色矩形=帧裁切越界或蒙版未透明，一并根治。判据：乌鸦渲染尺寸相对悟空的比例与原版 cell 一致（数值写 report），无灰块，截图。
4. **掉落物样式（用户拍板）**：图标放大（约 1.5~2 倍）、透明底、删金色稀有度圆环、删蓝色就近高亮框。稀有度信息保留在悬浮名字文本色即可（原版就是文字颜色区分）。判据：截图。
5. **SLZ 拼音标签去除（用户拍板）**：技能释放时不再显示拼音缩写飘字。判据：释放技能截图无标签。
6. **战斗内技能入口复用技能树页（用户拍板，原版行为）**：战斗 dock 的"技能"按钮从 toast 改为直接打开 SkillTreeScene（世界地图入口同一页面；注意战斗暂停/恢复与返回路径）。判据：战斗内点技能→技能树页开→关闭回战斗且状态无损，截图两张。

Stretch（时间允许才做，做不了 report 留档）：WuKong.swf 悟空技能特效帧提取（FFDec，参照 asset-pipeline-notes）接入 1~2 个代表技能（升龙斩优先）。

## 验证

codex 侧：能单测的（网格常量/相机钳制函数）写 vitest，全量回归绿 + tsc 净。浏览器截图由包装层做：起 vite（探测空闲端口，nohup）+ playwright 独立 tab，逐判据截图存 tmp/visual-b-evidence/。包装层最后亲跑全量 vitest+tsc，绿了逐件 commit（沙箱 git 失败时代提交），不 push。
