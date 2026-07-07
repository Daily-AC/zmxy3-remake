# UI 素材清单

来源：out_res 34 包（原始 SWF，未加密）+ 主逻辑 SWF `打开我开始玩.swf`。
提取方法见 `docs/research/asset-pipeline-notes.md`（symbolclass 查名 + image/sprite 导出）。
均为透明底 PNG，未做任何二次编辑（裁剪除外，裁剪版另有 `_crop`/`_top`/`_bottom` 后缀说明）。

## 1. 对话框

| 文件 | 来源符号 | 建议用途 |
| --- | --- | --- |
| `dialogue_fullscene_stage12_frame1.png` | `Stage12XDialogue`（12.swf chid426，frame1/8） | **原版对话长什么样的完整参照**：悟空对反派喊话的完整渲染帧，看得出原版剧情对话根本不是"文字框"系统，而是**手绘漫画分镜**（左右两个半身立绘 + 底部墨迹横幅文字条）。给打磨棒定视觉规范时务必先看这张，不要预设成传统 RPG 对话框。 |
| `dialogue_textpanel_crop.png` | 同上，裁出底部文字条 | 可复用的"文字面板背景"单品：不规则墨迹刷痕黑底、白字，没有矩形边框。做新对话框 UI 时若想保留原版气质，面板背景应仿这个墨迹形状，不要做成直角描边框。 |
| `dialogue_tooltip_sayinfo.png` | `export.SayInfo`（OtherMat1.swf chid344） | 小尺寸提示气泡（示例文案"升级需要"），灰底白字圆角小标签。不是对话框，是升级/操作提示类的小 tooltip，可作为"次级弹出提示"的样式参照。 |

**重要发现**：全局搜索了 34 个资源包 symbolclass 和主逻辑 SWF 全部 446 个反编译类，**没有找到独立的"NPC 对话框"UI 组件**——原版游戏没有自由走动找 NPC 对话的系统，剧情只通过关卡内嵌的漫画分镜（如 `Stage12XDialogue`）推进。给 agent NPC 做对话 UI 时，这是全新设计，没有"原版对话框"可抠，只能参考上面两张的美术气质（墨迹分镜/横幅文字条）。

## 2. 战斗 HUD

| 文件 | 来源符号 | 建议用途 |
| --- | --- | --- |
| `hud_roleinfo_full.png` | `export.RoleInfo`（OtherMat1.swf chid341，已裁去空白） | **主战斗 HUD 完整参照**：头像+等级圆牌、HP/MP/EXP 三条状态条、底部快捷栏（法宝/宠物/技能/背包/设置 + 无双大招按钮 + 6 个技能槽）。这是原版真实的战斗界面全貌，一张图基本覆盖了本单要的"血条/蓝条/头像框/经验条"全部内容。 |
| `hud_roleinfo_top_avatar_bars.png` | 同上，裁出上半部分 | 单独的头像框+HP/MP/EXP 三条状态条，不含底部技能栏，适合只需要"血条组"时用。 |
| `hud_roleinfo_bottom_skilldock.png` | 同上，裁出下半部分 | 单独的技能/功能快捷栏（法宝/宠物/技能/背包/设置图标 + 无双按钮 + 6 空技能槽），适合只需要"技能栏"时用。 |
| `hud_bossblood.png` | `BossBlood`（主逻辑 SWF chid82） | Boss 血条：红色墨迹描边长条 + 左侧名牌（示例渲染是"巫鹰"这个 boss 的名字，运行时应为动态文本）。用于关底 boss 战顶部血条。 |
| `hud_levelup_fx.png` | `RoleLevelUpMc`（主逻辑 SWF chid548） | 附赠：升级时的金色光柱特效，非 UI 面板但是 HUD 相关的反馈特效，做升级反馈动画时可参考。 |

## 3. 背包界面

| 文件 | 来源符号 | 建议用途 |
| --- | --- | --- |
| `backpack_window_full.png` | `export.pack.BackPack`（backpack1.swf chid444） | 背包/个人资料整窗完整渲染：左侧角色资料面板（称号/战斗力、时装武器饰品头衔防具法宝六个装备格、HP/MP/攻击/防御等属性行、EXP 条），右侧道具网格容器（当前渲染是空的，格子由 `backpack_slot_cell.png` 逐格拼）+ 顶部分类 tab + 底部灵魂货币/出售/翻页控件。整体是深棕色木质描边窗口，边角有黑色墨迹装饰，风格与战斗 HUD 呼应。 |
| `backpack_slot_cell.png` | `export.pack.PackThings`（backpack1.swf chid114） | 单个物品格子的空槽背景（棕色圆角方块），网格化平铺即为背包/仓库格。 |
| `backpack_category_tabs.png` | `export.pack.BackPackElement`（backpack1.swf chid385） | 分类切换 tab 按钮组：装备/道具/时装/经书，橙黄底黑字圆角矩形。 |

**未找到**：品质/稀有度边框。查过 `AllEquipment.as`（角色装备数据表）里的稀有度字段（普通/优秀/精良/史诗/邪灵），发现原版是**用文字颜色区分稀有度**（如 0xFFFFFF/0x00FF00/0x0000FF/0x660099/0x666666），**没有对应的边框描边美术资源**——格子本身统一用同一个 `backpack_slot_cell.png`，稀有度差异只体现在物品名字的文字颜色上。如果新 UI 想做"品质边框"这个原版没有的视觉升级，是全新设计，没有原版素材可抠。

## 4. 通用件

| 文件 | 来源符号 | 建议用途 |
| --- | --- | --- |
| `button_generic_up.png` / `button_generic_over.png` / `button_generic_down.png` / `button_generic_disabled.png` | `Button_upSkin`/`overSkin`/`downSkin`/`disabledSkin`（主逻辑 SWF，标准 `fl.controls.Button` 组件皮肤） | **注意**：这四张是 Flash IDE 自带的默认组件按钮皮肤（灰底圆角描边，hover/down 变蓝色描边），游戏**没有对它二次美化**，视觉上很朴素，猜测只用在一些次要的调试/系统面板。不代表游戏"真正"的按钮质感。 |
| `button_game_style_equip_tab.png` | `backpack_fla.Timeline_23`（backpack1.swf chid136，frame1） | **游戏实际使用的按钮风格参照**：黄色渐变圆角矩形 + 深色描边 + 黑字，示例文案"装备"（背包分类 tab 按钮的选中态之一）。这才是原版真正到处在用的按钮质感，如果要复刻"原版味道"的按钮，应该仿这个而不是上面四张默认皮肤。 |
| `button_game_style_use.png` | `backpack_fla.Timeline_99`（backpack1.swf chid437，frame1） | 同风格按钮的另一实例，示例文案"使用"，可与上一张对照确认这确实是通用按钮皮肤（不同文案复用同一套底图）。 |

## 小结 / 给下一棒的建议

- 对话框、品质边框：原版**不存在**，是新设计，只能参考墨迹/木纹的整体美术气质，不要照抄任何"原版对话框"这种其实并不存在的东西。
- HUD、背包、按钮：原版素材完整且直接可用，`hud_roleinfo_full.png` 和 `backpack_window_full.png` 两张图基本就是最权威的视觉规范源。
- 真正代表游戏按钮质感的是 `button_game_style_*.png`，不是 `button_generic_*.png`（后者是 Flash 默认皮肤，游戏没用心做）。
