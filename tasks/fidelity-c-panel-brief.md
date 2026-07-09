# 任务书：保真 C 棒——个人资料/背包面板四处布局与蒙版 bug

派发：2026-07-09 主会话 → codex。report 写 `tasks/fidelity-c-panel-report.md`。
用户实玩截图判读（`tasks/fidelity-r3-backlog.md` C 节，截图存 docs/reference/user-flow-refs/ 若有；四个框的描述如下）。产权只有 `game/src/ui/`（重点 hud/BackpackWindow.ts 及其子组件）+ `game/tests/` + 本 report。**不许动 BattleScene.ts / systems/**（A 棒并行占用）——若修复必须动接线层，停手写 report 交主会话串行。

## 四件事

1. **左侧属性列纵向过挤**（白框）：昵称/战斗力/HP/MP/攻击/防御/幸运/魔抗/暴击/闪避/回血/回蓝/EXP 行距挤压重叠感明显。对照原版 BackPack 版式（AS3 对象树 xfl 坐标可挖，`docs/playbooks/ui-port-dual-source.md` 管线；若原版行距数据难取，按现面板高度均分并在 report 标注 Adapted）。判据：行间距均匀、无重叠，截图对比。
2. **面板下方悬浮黄条**（绿框）：面板外底部悬浮一根黄色圆角条，疑 EXP 条填充体错位残留（EXP 标签在面板内但填充条跑到面板外）。定位创建处，归位或删除。判据：面板外无游离元素。
3. **灵魂/出售白装/翻页区文本重叠**（红框）：右下"灵魂 0"、"出售白装"按钮、"上一页 1/1 下一页"三组元素挤叠。重排布局（参考原版 BackPack 底栏：灵魂计数居左、出售白装居右、页码居中分离）。判据：三组元素互不重叠，截图对比。
4. **右侧灰色蒙版矩形**（蓝框）：面板右侧一块无内容灰色矩形。定位来源（占位容器/未加载贴图的底板/多余遮罩），删除或修复其内容。判据：该区域无空灰块。

## 验证

- codex 侧：组件层可单测的（布局常量/子元素计数）写 vitest；全量回归绿。
- 包装层（你，claude wrapper）：codex 完成后亲自起 vite（用空闲端口，5301 可能被占，先探测；nohup 脱管）+ playwright 独立 tab，走 主菜单→新开档→选悟空→世界地图→进关→打开背包 截图四处修复点，图存 tmp/panel-c-evidence/，report 附截图路径。然后亲跑全量 vitest+tsc，绿了 commit（只 add 产权文件），不 push。
