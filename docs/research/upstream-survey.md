# 上游开源项目调研（2026-07-07）

结论：三个仓库各补一块拼图——zmxy_res 给素材源，kagami 给机制知识，XinTianyu 给策划数据。没有任何前人做过 agent NPC。

## zmcj21/zmxy_res（73★，素材/本体仓库，368MB）

- `造梦西游魔改版/造梦西游3再续天庭最终版/`：
  - `造梦西游3再续天庭0.72(最终版本)/`：完整可玩客户端（exe + 主 swf + assets/）
  - `out_res/`：**已解密**的全套 SWF（0-20.swf 关卡、BaJie.swf、Common1.swf 等）
  - `crack.txt`：解密参数记录（ver=3）
- `tools/ffdec_15.0.0/`：自带 FFDec（版本旧，我们另装新版）
- 另含造梦1/2 素材、OL 全套资源、存档
- 作者（造梦C君）在用 Unity 做怀旧联机版，README 留了联系方式

## kagami-kasumi/zaomengxiyou3-zaixutiantingpian-phaser-version（推送至 2026-06-29）

深评结论（很 thorough 的 agent 评估，session 1）：

- 定性：机制逻辑库 + 调试沙盒 + AI 协作脚手架的作品集项目，**不是可玩游戏**。
- 资产：src/ 3.2 万行 Phaser 无关 strict TS 纯逻辑（5 角色技能树/战斗/宠物/装备/掉落/版本化存档），2693 条测试断言；docs/reverse-engineering/ 6500 行逆向文档，核心是 mechanics-index.md（机制 ↔ AS3 类名证据 ↔ 复现状态 追溯矩阵）；src/assets/AssetManifest.ts 列了每个缺失素材的 AS3 符号名（如 Role1Bullet1、Monster30、bg11）；docs/reverse-engineering/reference/ 有原版数值 CSV（装备 178 行/掉落 67/合成 62/宝石 18）。
- 缺口：零素材零音频、只有 TestScene 一个调试场景、仅 1 关、无菜单/选人/世界图、无任何 NPC/对话/LLM 代码。
- **无 LICENSE** → 代码不能复制进本项目，只作参考（"标准答案"）。已决定暂不联系作者。

## XinTianyu-Sky/ZMXY（推送至 2026-05-24）

深评结论：

- README 夸大：伤害"公式"是从不解析的字符串；技能等级硬编码 1；57 怪只有 5 个有美术，其余渲染成色块；无测试；node_modules/dist 提交进 git；单 commit；README 写 MIT 但**无 LICENSE 文件**（且素材系原版提取，作者本无权授权）。
- 可抽资产：`public/sounds/` 84 个规整命名原版音频（bg0-7 + Role1-4 全套打击音效）；`src/config/` 数值 JSON（monsters.json 57 怪属性、levels.json 10 关波次、skills.json MP 曲线、equipment.json 57 件）——数据扒自原版，当策划数据源核对用。
- 代码骨架小而可读（2200 行 AABB+状态机）但不值得继承。

## jbji/ZaoMeng_JourneyToTheWest_3_4399_Flash_Utility（MIT）

- SWF 加密原理：文件头 byte-swap；造3/再续参数 PIVOT=200 END=275，造2 参数 96/165。
- 存档 ⇄ XML 转换器（单机/网页版存档互通）。
- kagami-kasumi 另有 save-transformer（.sav→.xml，Python），佐证存档格式已被逆向。

## 其他

- congxy/zaomeng_demo：pygame 玩具复现，无用。
- 2252878154/godot_ZMXY：GDScript"八荒湮隳"，未深查。
- Flashpoint 收录了造梦系列，可作素材备源。
- 本地 ~/Projects/mythic-dream-journey（大梦天阙）：2026-05-10 的原创 TS+Canvas 横版 ARPG 原型，与本项目无代码关系。
