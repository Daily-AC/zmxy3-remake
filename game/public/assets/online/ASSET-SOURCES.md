# Online-sourced art (系列后作《造梦西游 Online·大闹天庭篇》)

**来源标注（非法律，是保真质量）**：用户是造梦西游团队成员，全系列素材使用无版权障碍
（2026-07-07 用户拍板，见 CLAUDE.md）——**无分发红线、无占位/替换债**。这里集中的是从 Online
客户端逆向出的素材（来源与解密见 `docs/reference/zmxy-online-extracted/README.md`）。

保留一条纪律：**造3 本体素材与 Online 后作素材要区分使用**，混搭会有"缝合感"、破坏"复刻造3"的
保真度。故 Online-sourced 素材集中在本目录、消费组件用 `export const ASSET_SOURCE_ONLINE = true`
标注，方便终包做一次风格一致性审查（不是要清空/替换，是要确认风格不突兀）。

| 素材 | 消费组件 | 备注 |
|---|---|---|
| `skill-icons/ss_{slz,lys,hytj,lyfb,jdy,qsez,zz,hmz,hyjj}.png`（9，45×45） | `game/src/ui/hud/SkillBarHud.ts` | 符号名与 heroSkill.ts Role1SkillId 逐一对应；造3 侧无独立技能图标位图，Online 图标直接用 |
| `results/challenge-success.png` / `challenge-fail.png`（510×304） | `game/src/ui/hud/ResultBanner.ts` | 过关/失败横幅；造3 侧同名容器 `export.win.GameWin`/`export.lose.GameFail` 是矢量拼装，位图抠不出，Online 版可直接用 |
| `results/my-results-banner.png` / `retry-button.png` | `ResultBanner.ts` | 成绩条 / 重试按钮 |

风格一致性提示：Online 悟空造型（双节棍、描边更粗）与造3 本体略有差异；若终包觉得突兀，可换造3
DNA 自绘的横幅/按钮。SkillBarHud 的坞体框/热键字母/CD 遮罩为 DNA 自绘（非 Online）。
