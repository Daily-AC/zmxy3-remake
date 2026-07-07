# 音频清单（game/public/assets/audio/）

来源：`vendor/zmxy_res/造梦西游魔改版/造梦西游3再续天庭最终版/out_res/Music.swf`——
唯一含音频的资源包（已扫过其余 33 个 out_res SWF，均无 `DefineSound`/`SoundStreamHead`
标签）。`-export sound` 导出全部 85 个 `DefineSound` 标签（chid 1–84 有 symbolclass 绑定，
另有一个 `SoundStreamHead2`(cid -1) 是无类名绑定的哑元占位符，44 字节空 WAV，非真实音效，
已跳过不入库）。**对账：84 个具名符号 = 84 个导出 mp3 = 84 个已入库文件，无缺口、无多余。**

已跳过：无类名绑定的哑元 `-1.wav`（非真实音效，纯 WAV 头零数据）。

文件名去掉了 FFDec 导出时加的 `<chid>_` 数字前缀，直接用符号名（如 `24_bg4.mp3` →
`bg4.mp3`）。全部原生即 mp3 编码（FFDec 对 `DefineSound` 默认按源编码导出）。抽样验证
（`afinfo` 读出正确时长 + `afplay` 实际播放无报错）：`bg0.mp3`（123.9s BGM）、
`pickup.mp3`（0.6s）、`Role1_hit1AndHit2.mp3`（0.57s）——三条均正常。

未额外引入 XinTianyu-Sky/ZMXY 的补充音频源：该仓库列出的 84 个音频文件与本清单同源
（同一游戏的同一批音效），Music.swf 直接导出已 100% 覆盖、无缺口，不需要第二个来源
做补充或对照。

置信度标注方法：符号名与 `game/src/systems/heroSkill.ts`（`actionName` 字面量）+
`game/src/data/roles/role{1..4}.json`（`actions` 表键名）交叉核对到的标"高"；
仅凭符号名字面推断、没有代码交叉验证点的标"中"；符号名本身含义不明确的标"低"。

## 清单

| 文件 | 时长 | 置信度 | 内容描述 |
|---|---|---|---|
| `BeattackByRole1.mp3` | 0.42s | 高 | 被 Role1（本方角色）攻击命中时，对方（怪物/敌人）播放的挨打反馈音；已在 BattleScene.ts 接线为 `monHurt` |
| `BeattackByRole2.mp3` | 1.04s | 高 | 被 Role2（本方角色）攻击命中时，对方（怪物/敌人）播放的挨打反馈音 |
| `begin.mp3` | 59.94s | 高（时长与关卡 BGM 同级，符号名直译） | 游戏开场/标题界面 BGM |
| `bg0.mp3` | 123.92s | 高 | 第 0 关战斗 BGM 循环轨 |
| `bg1.mp3` | 60.55s | 高 | 第 1 关战斗 BGM 循环轨 |
| `bg2.mp3` | 72.07s | 高 | 第 2 关战斗 BGM 循环轨 |
| `bg3.mp3` | 65.83s | 高 | 第 3 关战斗 BGM 循环轨 |
| `bg4.mp3` | 60.19s | 高 | 第 4 关战斗 BGM 循环轨 |
| `bg5.mp3` | 63.58s | 高 | 第 5 关战斗 BGM 循环轨 |
| `bg6.mp3` | 64.05s | 高 | 第 6 关战斗 BGM 循环轨 |
| `bg7.mp3` | 65.04s | 高 | 第 7 关战斗 BGM 循环轨 |
| `Game_Victory.mp3` | 2.86s | 高（符号名直译） | 通关/胜利结算音效 |
| `m_bg12.mp3` | 61.05s | 高 | 第 12 关战斗 BGM 循环轨（"m_"前缀命名，与 bg0-7 同用途） |
| `m_bg13.mp3` | 58.99s | 高 | 第 13 关战斗 BGM 循环轨（"m_"前缀命名，与 bg0-7 同用途） |
| `over.mp3` | 2.81s | 高 | 失败/关底结算音效（"游戏结束"类短促音） |
| `pickup.mp3` | 0.62s | 高 | 拾取物品/装备反馈音（BattleScene.ts 已接线 `pickup` 事件） |
| `Role1_beAttack.mp3` | 0.52s | 高 | Role1 自身被命中时的痛呼音效（区别于"打在别人身上"的 BeattackByRoleN） |
| `Role1_dead.mp3` | 1.56s | 高 | Role1 死亡音效 |
| `Role1_hit10_2.mp3` | 2.81s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 10 段攻击/技能音效 （变体_2）；对应动作名 `hit10_2`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit10_4.mp3` | 2.60s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 10 段攻击/技能音效 （变体_4）；对应动作名 `hit10_4`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit11.mp3` | 1.14s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 11 段攻击/技能音效；对应动作名 `hit11`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit12_1.mp3` | 0.75s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 12 段攻击/技能音效 （变体_1）；对应动作名 `hit12_1`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit12_2.mp3` | 1.03s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 12 段攻击/技能音效 （变体_2）；对应动作名 `hit12_2`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit13_1.mp3` | 0.89s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 13 段攻击/技能音效 （变体_1）；对应动作名 `hit13_1`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit13_2.mp3` | 0.40s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 13 段攻击/技能音效 （变体_2）；对应动作名 `hit13_2`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit14.mp3` | 0.96s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 14 段攻击/技能音效；对应动作名 `hit14`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit1AndHit2.mp3` | 0.57s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 1 段攻击/技能音效 （与 hit2 共用同一段音效，对应 role1.json 里 hit1/hit2 相邻连击帧）；对应动作名 `hit1`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit3AndHit4.mp3` | 0.55s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 3 段攻击/技能音效 （与 hit4 共用同一段音效，对应 role1.json 里 hit3/hit4 相邻连击帧）；对应动作名 `hit3`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit5.mp3` | 0.78s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 5 段攻击/技能音效；对应动作名 `hit5`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit6.mp3` | 1.25s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 6 段攻击/技能音效；对应动作名 `hit6`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit7.mp3` | 1.69s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 7 段攻击/技能音效；对应动作名 `hit7`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit8.mp3` | 1.30s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 8 段攻击/技能音效；对应动作名 `hit8`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_hit9.mp3` | 1.66s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role1 第 9 段攻击/技能音效；对应动作名 `hit9`，见 game/src/data/roles/role1.json actions 表 |
| `Role1_jump.mp3` | 1.20s | 高 | Role1 跳跃音效（已在 BattleScene.ts 接线为 `heroJump`） |
| `Role2_beAttack.mp3` | 0.42s | 高 | Role2 自身被命中时的痛呼音效（区别于"打在别人身上"的 BeattackByRoleN） |
| `Role2_dead.mp3` | 1.46s | 高 | Role2 死亡音效 |
| `Role2_hit1.mp3` | 0.78s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role2 第 1 段攻击/技能音效；对应动作名 `hit1`，见 game/src/data/roles/role2.json actions 表 |
| `Role2_hit10.mp3` | 1.40s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role2 第 10 段攻击/技能音效；对应动作名 `hit10`，见 game/src/data/roles/role2.json actions 表 |
| `Role2_hit2.mp3` | 1.51s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role2 第 2 段攻击/技能音效；对应动作名 `hit2`，见 game/src/data/roles/role2.json actions 表 |
| `Role2_hit3.mp3` | 3.90s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role2 第 3 段攻击/技能音效；对应动作名 `hit3`，见 game/src/data/roles/role2.json actions 表 |
| `Role2_hit4.mp3` | 2.39s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role2 第 4 段攻击/技能音效；对应动作名 `hit4`，见 game/src/data/roles/role2.json actions 表 |
| `Role2_hit5.mp3` | 2.91s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role2 第 5 段攻击/技能音效；对应动作名 `hit5`，见 game/src/data/roles/role2.json actions 表 |
| `Role2_hit6.mp3` | 1.35s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role2 第 6 段攻击/技能音效；对应动作名 `hit6`，见 game/src/data/roles/role2.json actions 表 |
| `Role2_hit7.mp3` | 1.43s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role2 第 7 段攻击/技能音效；对应动作名 `hit7`，见 game/src/data/roles/role2.json actions 表 |
| `Role2_hit8.mp3` | 2.52s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role2 第 8 段攻击/技能音效；对应动作名 `hit8`，见 game/src/data/roles/role2.json actions 表 |
| `Role2_hit9.mp3` | 2.39s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role2 第 9 段攻击/技能音效；对应动作名 `hit9`，见 game/src/data/roles/role2.json actions 表 |
| `Role2_jump.mp3` | 2.08s | 高 | Role2 跳跃音效（当前只有 Role1 可玩，此文件是未来角色切换的预留资产） |
| `Role3_beAttack.mp3` | 0.57s | 高 | Role3 自身被命中时的痛呼音效（区别于"打在别人身上"的 BeattackByRoleN） |
| `Role3_dead.mp3` | 0.99s | 高 | Role3 死亡音效 |
| `Role3_hit1.mp3` | 0.62s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 1 段攻击/技能音效；对应动作名 `hit1`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit10.mp3` | 2.13s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 10 段攻击/技能音效；对应动作名 `hit10`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit11.mp3` | 1.63s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 11 段攻击/技能音效；对应动作名 `hit11`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit12_1.mp3` | 2.34s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 12 段攻击/技能音效 （变体_1）；对应动作名 `hit12_1`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit12_2.mp3` | 1.66s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 12 段攻击/技能音效 （变体_2）；对应动作名 `hit12_2`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit2.mp3` | 0.73s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 2 段攻击/技能音效；对应动作名 `hit2`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit3.mp3` | 0.99s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 3 段攻击/技能音效；对应动作名 `hit3`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit4.mp3` | 1.01s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 4 段攻击/技能音效；对应动作名 `hit4`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit5.mp3` | 1.01s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 5 段攻击/技能音效；对应动作名 `hit5`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit6.mp3` | 1.35s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 6 段攻击/技能音效；对应动作名 `hit6`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit7.mp3` | 3.91s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 7 段攻击/技能音效；对应动作名 `hit7`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit8.mp3` | 0.78s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 8 段攻击/技能音效；对应动作名 `hit8`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_hit9.mp3` | 1.45s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role3 第 9 段攻击/技能音效；对应动作名 `hit9`，见 game/src/data/roles/role3.json actions 表 |
| `Role3_jump.mp3` | 2.39s | 高 | Role3 跳跃音效（当前只有 Role1 可玩，此文件是未来角色切换的预留资产） |
| `Role4_hit1.mp3` | 0.43s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 1 段攻击/技能音效；对应动作名 `hit1`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit10.mp3` | 1.55s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 10 段攻击/技能音效；对应动作名 `hit10`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit10Arrow.mp3` | 1.39s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 10 段攻击/技能音效 （沙僧弓系武器分支专属，对照铲系默认分支的同编号音效）；对应动作名 `hit10Arrow`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit11.mp3` | 1.95s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 11 段攻击/技能音效；对应动作名 `hit11`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit12.mp3` | 3.04s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 12 段攻击/技能音效；对应动作名 `hit12`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit12Arrow.mp3` | 2.13s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 12 段攻击/技能音效 （沙僧弓系武器分支专属，对照铲系默认分支的同编号音效）；对应动作名 `hit12Arrow`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit1Arrow.mp3` | 0.60s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 1 段攻击/技能音效 （沙僧弓系武器分支专属，对照铲系默认分支的同编号音效）；对应动作名 `hit1Arrow`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit2.mp3` | 0.46s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 2 段攻击/技能音效；对应动作名 `hit2`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit2Arrow.mp3` | 0.75s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 2 段攻击/技能音效 （沙僧弓系武器分支专属，对照铲系默认分支的同编号音效）；对应动作名 `hit2Arrow`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit3.mp3` | 0.82s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 3 段攻击/技能音效；对应动作名 `hit3`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit4.mp3` | 0.93s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 4 段攻击/技能音效；对应动作名 `hit4`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit4Arrow.mp3` | 1.20s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 4 段攻击/技能音效 （沙僧弓系武器分支专属，对照铲系默认分支的同编号音效）；对应动作名 `hit4Arrow`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit5.mp3` | 3.12s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 5 段攻击/技能音效；对应动作名 `hit5`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit6.mp3` | 2.29s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 6 段攻击/技能音效；对应动作名 `hit6`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit7.mp3` | 4.22s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 7 段攻击/技能音效；对应动作名 `hit7`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit8.mp3` | 0.56s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 8 段攻击/技能音效；对应动作名 `hit8`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit8Arrow.mp3` | 0.71s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 8 段攻击/技能音效 （沙僧弓系武器分支专属，对照铲系默认分支的同编号音效）；对应动作名 `hit8Arrow`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit9.mp3` | 0.80s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 9 段攻击/技能音效；对应动作名 `hit9`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_hit9Arrow.mp3` | 0.95s | 高（符号名与 role*.json 动作表 + heroSkill.ts actionName 三方吻合） | Role4 第 9 段攻击/技能音效 （沙僧弓系武器分支专属，对照铲系默认分支的同编号音效）；对应动作名 `hit9Arrow`，见 game/src/data/roles/role4.json actions 表 |
| `Role4_mds.mp3` | 2.13s | 低（命名不明确，需要日后对照原版技能名核实） | Role4（沙僧）专属技能音效，符号名缩写含义未查明 |
| `SD_xz.mp3` | 0.89s | 中（结构性推断，未在原版 UI 里逐一点击核对） | SD1.swf 对应 PK 竞技场系统的 UI 选择/确认音效（"xz"疑为"选择"拼音缩写） |

## 已知缺口（原版资源包里没有对应音效）

这些游戏事件当前**没有**匹配的原版音频，`game/src/data/soundMap.ts` 里对应条目显式写
成 `null`（不是漏填，是核实过原版确实没有）：

- **移动/待机循环**（`wait`/`wait2`/`walk`/`run`）：84 个符号里没有脚步声或待机环境音，
  原版这几个状态本来就是静音的。
- **二段跳/落地**（`jump3`）：只有起跳有专属音效（`RoleN_jump`），二段跳和落地复用同一
  个或完全静音，原版没有单独的落地音效符号。
- **升级**（`levelup`）：progression.ts 的升级是本项目原创系统（kagami 移植 + 本项目
  加的经验/升级 UI 反馈），原版 84 个音效里没有对应"叮"一声的升级音效符号。
- **重生**（`respawn`）：heroCombat.ts 的复活也是本项目原创机制（CLAUDE.md 记录的
  "无 kagami 现成逻辑"四块原创之一），原版没有复活音效。
- **UI 点击**（`ui_click`）：backpack1.swf/Common1.swf 等 UI 包本身没有 `DefineSound`
  标签（已在 SWF 扫描里确认），原版 UI 交互是静音的，没有通用点击音效可抠。

## 前瞻资产（暂未接线，非缺口）

`Role2_*`/`Role3_*`/`Role4_*` 系列（唐僧/八戒/沙僧的 hit/jump/dead/beAttack 音效，共
57 个文件）目前游戏只有 Role1（悟空）可玩，`game/src/data/soundMap.ts` 暂只映射 Role1。
这些文件已经在库里、已经归档进本清单，留给未来角色切换/多角色玩法启用时直接复用，不算
"没做完"，只是还没有消费方。
