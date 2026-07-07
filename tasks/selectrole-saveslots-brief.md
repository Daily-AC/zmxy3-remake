# S2 选人 + S3 存档 — 派工 brief（session4 第二棒，2026-07-08）

授权背景：本项目是《造梦西游3》团队成员的授权重制（CLAUDE.md「法律风险已澄清」节），FFDec 读取的是团队自有游戏资源。

## 目标

按 `docs/design/screen-fidelity-spec.md` §S2 §S3 重做选人屏与存档屏版式（同一棒，串行两屏）。功能不变（仅悟空可选、6 槽增删读），版式照参照图重做。

规格真源（必读）：
- spec §S2（选人）§S3（存档）——逐条即验收项，样式判断以 spec + 参照图为准，不得自行发挥。
- `docs/playbooks/ui-port-dual-source.md` 全文，**尤其文末「S1 棒沉淀的三条补充纪律」**（符号 origin 必算、舞台 contain-fit+pillarbox、overlay 先对几何）——S1 棒因违反前两条被打回过，别重蹈。
- 参照图：`docs/reference/user-flow-refs/selectrole-original-{idle,1p,2p}.png`、`saveslots-original.png`（对照现状 `selectrole-ours.png`、`saveslots-ours.png`）。

## S2 选人（先做）

- 源：vendor `out_res/` 的 SelectRole 符号族（meta-shell 棒已挖到五格墨迹立绘，先盘点 `game/public/assets/extracted/` 现存件再补挖）；AS3 骨从主 SWF `打开我开始玩.swf` 读 SelectRole 类（hover 浮层相对定位是已知的"必读 AS3"点；选中/确认的事件语义顺带核对）。
- 版式要点（spec 原文）：五格全屏直通到底，无外框无大标题无底部按钮条，格间墨迹分隔；未选态全员灰度立绘+底部书法体名字+第三格"请输入名字"小字；选中态该格背景变红+立绘上彩+顶部 1P 墨迹角标；确认=再次点击/回车。现状的金边框/大标题/返回确定按钮/悟空格小 sprite 全删。
- 灰度用原版自带灰度件，没有才 tint（report 注明用了哪种）。
- 判据：三态（未选/选中/确认瞬间）与参照三图逐张 overlay（先按 playbook 纪律 3 对几何）；仅悟空可选其余灰锁；`__shellSelectHero/__shellConfirm` 钩子保留。

## S3 存档（S2 过自查后做）

- 版式 = **Online 版**（用户指定，spec §S3）："存档记录"标题居中、深灰圆角双列卡片、左侧橙色大编号、卡内两行（角色名+时间戳）、右上红 X 关闭、无金边框。空档同版式显示"空存档位"。
- 素材：`docs/reference/zmxy-online-extracted/` 里挖存档界面符号；挖不到完整件就用能挖到的原件+从参照图量版式（此屏参照图为 Online 截图，本身就是真源；量出的常量在 report 列表注明"图量"来源）。
- 判据：与参照 overlay（结构层：卡片网格/编号/标题/关闭钮位置）；6 槽新建/继续/删除功能回归绿；`__shellSlots/__shellNewGame/__shellContinue/__shellDeleteSlot` 钩子保留。

## 工程约定（同 S1 棒）

- Phaser 4（渲染层写前查 v3→v4 差异）；解锁/状态逻辑纯模块可单测；素材落 `game/public/assets/extracted/`（进 git）。
- 交付物：代码+单测（本地 commit 拆粒度，**不 push**）、`tasks/selectrole-saveslots-report.md`（AS3 摘录+出处、坐标/origin 表、素材清单、Adapted/Dropped、豁免清单）、每屏 overlay 对比图（`game/tmp/s2s3-overlay/`）、流程截图（主菜单→存档→选人三态→确认进世界地图，`game/tmp/s2s3-flow/`）、`npm test` 全绿（基线 413+，新逻辑带测）+ `npm run build` 过。
- 环境事实：Java `/opt/homebrew/opt/openjdk/bin/java`；FFDec `tools/ffdec/ffdec-cli.jar` headless 必带子命令+`-Djava.awt.headless=true`；macOS 无 timeout；vite 用 nohup+独立端口（5195 目前被主会话的 dev server 占着，可直接复用或另起）；origin 推导可改 `tools/worldmap-deco-origins.py`（换目标 XML/符号 id 即可）；调试产物只落 `game/tmp/`。
- 移植协议：怪设计记 report 保持原样；真 bug 与平台适配可改（带 Adapted/Dropped 注释）。

## 验收（主会话终审，非自验）

主会话亲自看 overlay/流程截图、复跑测试。像素级错位、样式自行发挥、未按 playbook 三条纪律执行会被打回。
