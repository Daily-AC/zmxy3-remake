# art-keyart 生图美术三件套 — 交付 report

产出目录：`game/tmp/art-keyart/`（候选图 tmp 不进 git，本 report 进 git）。
风格锚：统一水墨毛笔 + 天宫云海 + 暖旧宣纸调，三件互相自洽（满足总纲 3a「生图风格自洽铁律」）。

> **工作流状态（team lead 追加铁律）**：先出 keyart 候选 → 终审+用户挑定一张为**全项目风格锚** → 锚定稿后地面/标题以锚图 image-to-image 重出正式件。因此本 report 里**件 1 keyart = 待审定候选**；**件 2 地面 / 件 3 标题 = 已打样（链路与效果验证通过），非正式定稿件**，正式件待锚定稿后重出。style bible 见 `docs/design/art-style.md`（进 git）。

> **返修轮（用户定锚 C + 洗色返修，2026-07-08）**：用户定锚 **keyart C**，但指出八戒/沙僧被洗色（太浅、与悟空唐僧饱和度不匹配）。根因：首版角色 ref 用了灰度五格图（原版未选中滤镜灰态），拖偏这两位上色。返修见下方「件 1 返修」。已把该坑写进 art-style.md 禁忌清单。**锚图路径待返修图终审通过后回填。**
角色形象基准：`game/public/assets/extracted/menu/select_role_idle.png`（五格造型：冠/发带/狂发/黑影）+ `docs/reference/user-flow-refs/selectrole-original-buttons.png`（全彩悟空）+ 全彩基础 sprite `role2/3/4_0.png`（拿到八戒/沙僧/唐僧本体配色，避免上色天马行空）。

## 生成链路结论

- **gpt-image-2 i2i**：打样阶段验证有效（见 pilot），但出整图时 RunningHub i2i 端点抽风返回 `1007 input_image not supported`，连打样成功过的同一张 ref 也失败（非内容审核，是端点临时异常，失败会计费故未硬重试）。
- **seedream-5-image**：整图与地面全部走这条，多图输入锁角色一致性效果最好，三张 keyart 均 5504×3040。
- 依赖：seedream 脚本缺 requests/pillow/scipy，已在 scratchpad 建 venv 装好；配置 `~/.seedream-config.json` 就绪。

---

## 件 1：首页背景 keyart（16:9，5504×3040）

打样（必做的单角色忠实度验证）：`pilot/wukong_ink_v1.png` — gpt-image-2 i2i 以全彩悟空 crop 为 ref，水墨化后发带回纹/缝合 X 嘴/缝疤/黄眼红脸蛋/虎皮裙/红金箍棒全部忠实，证明「水墨风 + Q 版形象忠实」可两全，据此再出整图。

三候选（seedream，ref = 五格灰度造型图 + 全彩悟空 + 打样水墨图）：

| 候选 | 路径 | 特点 |
|---|---|---|
| A | `keyart/keyart_seedream_A.png` | 大台阶天宫门景深，干净，角色偏扁平卡通 |
| B | `keyart/keyart_seedream_B.png` | 角色身上水墨飞白笔触最重、武器最清晰，但角色填满画面、上方留白少 |
| **C（推荐）** | `keyart/keyart_seedream_C.png` | 鎏金南天门大殿 + 暖金天光 + 云海台，最恢宏庄重；英雄居中偏下、**上方大片天光留白正好压标题与菜单**，最贴首页背景用途；唐僧锡杖这版最清楚 |

首页效果预览（C + 行楷标题）：`keyart/_mock_homepage_C_with_title.png` — 验证三件协同 + 标题在真实背景可读。

**逐角色忠实度（并排对参照）**：悟空棕发金回纹发带/黄橙坎肩蓝领/豹纹虎皮裙红边/红金箍棒 ✓；唐僧金色镂空毗卢冠/砖纹金袍/锡杖 ✓；沙僧蓝色狂野乱发/尖精灵耳/脸颊卷纹/宝杖 ✓；第五位全身黑影 + 白问号 ✓；五人均保留造梦西游标志布偶缝合脸（X 缝线嘴+脸缝疤+大眼+红脸蛋）。八戒缠头巾青绿僧衣 ✓，唯**九齿钉耙在 A/C 偏弱、B 最清楚**——这是唯一小瑕，若定 C 建议对八戒武器局部重绘一版。画面无任何文字 ✓。

**推荐 C**。若要角色笔触更冲、更「画」，退 B。

### 件 1 返修：八戒/沙僧洗色返修（在定锚 C 上）

真彩参照（裁自全彩动作帧，非灰度）：八戒 `refs/pigsy_color_white.png`（role3：深青绿 teal 僧衣+金黄缠头巾+暖褐肤），沙僧 `refs/sha_color_white.png`（role4：鲜明蓝发+橙金发带+青绿甲金描边+绿裤）。

两条返修链路都跑了（均为 i2i 重上色）：

| 返修版 | 路径 | 评估 |
|---|---|---|
| **gpt-image-2 i2i（推荐）** | `keyart/keyart_C_recolor_gpt.png`（3840×2160） | 八戒/沙僧饱和度对齐真彩帧；**八戒九齿钉耙清晰**（小瑕一并修好）；悟空/唐僧/黑影/天宫构图保留无劣化。gpt i2i 端点已恢复 |
| seedream i2i | `keyart/keyart_C_recolor_seedream.png`（5504×3040） | 饱和度也对齐，分辨率更高，但**八戒钉耙仍是光杆无耙齿**、整体略糊 |

验证证据（进 report 参照，图在 tmp）：
- 与旧 C 并排整图 diff：`keyart/_diff_C_vs_recolor_gpt.png`（TOP 旧 C / BOTTOM 返修）——八戒沙僧显著上色，其余保留；唯一副作用是整图饱和度略提、线条略插画化（整图 i2i 固有，非退化）。
- 八戒/沙僧新色 vs 真彩帧色板对比：`keyart/_colorcheck_pigsy_sha.png`——饱和度可比，达标。

**推荐用 gpt 版 `keyart_C_recolor_gpt.png` 为最终锚**（钉耙清晰 + 饱和达标胜过 seedream 版的高分辨率）。若用户嫌整图 i2i 的全局饱和/线条漂移，兜底方案：mask-composite（只把返修图的八戒/沙僧两区域羽化贴回原 C，其余像素 100% 来自原 C，零漂移）——工序更重，待用户指令再做。

**两版形象一致性对比结论（已终审）**：gpt 版胜出并定锚；seedream 洗色返修版淘汰——八戒缠头巾跑成蒙眼带、唐僧锡杖变三叉戟，形象一致性不合格。

---

## 收尾：正式件交付（2026-07-08 用户终审定锚，落位 `game/public/assets/generated/`）

锚定稿 = **keyart C 洗色返修 gpt 版**。风格锚归档 `docs/reference/art-anchor.png`（进 git，源 `keyart_C_recolor_gpt.png` 3840×2160）；art-style.md 锚图路径已回填。

| 正式件 | 路径 | 规格 | 说明 |
|---|---|---|---|
| 首页 keyart | `game/public/assets/generated/keyart-home.png` | 1920×1080 | 锚图缩至 1920 宽（视口 960×540） |
| 战斗地面贴条 | `game/public/assets/generated/battle-floor-tile.png` | 2048×512（4:1 横向无缝） | floor_A_seamless 缩放，无缝性保持 |
| 「再续西游」标题 | `game/public/assets/generated/title-zaixuxiyou.png` | 1400×443 透明底 | 行楷 + 飞白，零错字 |

- **走廊沿用佐证**：floor A 打样版与锚同色调家族（暖米白玉石/宣纸/云纹呼应锚图祥云），并排对比 `game/tmp/art-keyart/floor/_tone_compare_floor_vs_anchor.png`，判定直接沿用（未重出）。
- **首屏成品预览**：`game/tmp/art-keyart/keyart/_final_homepage_preview.png`（锚 + 正式标题合成，三件协同、风格自洽）。
- 首屏接线（换掉旧 title-bg 脏件）由场景棒接，本单不动代码。

---

## 件 2：战斗地面走廊贴条（4:1，8192×2048，可无缝平铺）

两候选（seedream，ref = 战斗图地面雕花 crop）：

| 候选 | 路径 | 特点 |
|---|---|---|
| **A（推荐）** | `floor/floor_seedream_A.png` | 米白玉石长条 + 连续回旋云纹浮雕带，暖米金调，**与 keyart C 宣纸暖调同锚** |
| B | `floor/floor_seedream_B.png` | 青玉台面 + 顶沿鎏金云纹 + 冰裂纹，结构更像「平台正面」但偏冷、略离锚 |

**无缝化**：seedream 手绘纹样左右端不自然衔接，已对 A 做横向 10% 边缘 cross-fade 融合 → `floor/floor_A_seamless.png`（真无缝，交付用这张）。双拼验证 `floor/floor_A_tiled_preview.png`：拼接点与回绕点均无可见接缝、云纹连续。画面无文字/人物 ✓。

**推荐 A（用 floor_A_seamless.png）**。

---

## 件 3：「再续西游」毛笔书法标题

**没走生图**：「续」字复杂，生图模型高概率崩字，按反错字铁律直接走「系统书法字体渲染 + 飞白后处理」可靠路线，零错字。脚本 `tools/render-title-calligraphy.py`（可复用于其它 UI 书法字）。飞白做了克制的横向条状干笔 + 边缘集中 + 墨晕，非均匀雪花。

三候选（透明底 PNG，2400×760）：

| 候选 | 路径 | 笔意 |
|---|---|---|
| **1 行楷（推荐）** | `title/title_xingkai_transparent.png` | Xingkai SC 行草，飘逸毛笔感最强，深墨透明底压亮色首页最佳。宣纸预览 `title/_preview_title_xingkai_transparent_on_xuan.png` |
| 2 报隶 | `title/title_baoli_transparent.png` | Baoli SC 隶书笔意，圆浑厚重。预览 `title/_preview_title_baoli_transparent_on_xuan.png` |
| 3 行楷深底+印 | `title/title_xingkai_darkseal.png` | 浅墨字 + 深水墨底 + 红「梦」印，闪屏/深底用 |

四字「再续西游」三版全部字形正确、无错字缺笔（最易崩的「续」逐版核对通过）。

**推荐 1（行楷透明底）**。

---

## 三件总推荐组合

keyart **C** + 地面 **floor_A_seamless** + 标题 **行楷透明底** —— 首页效果见 `_mock_homepage_C_with_title.png`，三件同一水墨宣纸暖调锚，风格自洽。

唯一遗留小项：若定 keyart C，建议对八戒九齿钉耙局部重绘补清晰（B 版可作局部参照）。
