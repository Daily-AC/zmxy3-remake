// Shared palette + texture manifest for the battle HUD components. Keeping the
// asset list here (rather than each component loading its own files) means a
// host scene preloads once via `HUD_TEXTURES` / `HUD_ICONS`, and the components
// only ever build display objects from already-loaded texture keys. This is the
// seam the integration step wires into BattleScene.preload (see
// tasks/ui-round2-report.md).

export const HUD_COLORS = {
  hp: 0xd94a4a,
  mp: 0x4a86d9,
  exp: 0xe0b44a,
  track: 0x2a1c10,
  trackDark: 0x140d07,
  edge: 0x4a2c12,
  gold: 0xd9b45a,
  goldBright: 0xf2c65a,
  panel: 0x1a130b,
  ink: 0x0c0d12,
  text: '#f2eddf',
  textDim: '#c8bfa6',
  textGold: '#f0d99a',
} as const

// Damage / status floating-text style spec (rendering done by the caller).
// Calibrated to the 造梦 series look (docs/reference/zmxy-online-screens/
// combat-damage.png): normal hits are yellow, crits are RED and noticeably
// larger.
// 2026-07-10 打击感拍板（用户参照原版截图）：打怪伤害=橙色、自己掉血=紫色、
// 回血=绿色，全部上飘渐隐 + 出生弹跳缩放（spawnFloatingText 里做）。
// 2026-07-10 二轮拍板：数字不带正负号（颜色即语义），再大一号再粗一档；
// EXP/灵魂拾取不飘字（玩家看左上黄条/计数器）。
export const FLOAT_STYLES = {
  damage: { color: '#ff9c1a', fontSize: 30, fontStyle: 'bold', risePx: 52, durationMs: 820, stroke: '#4a2404', strokeThickness: 6 },
  crit: { color: '#ff2d2d', fontSize: 44, fontStyle: 'bold', risePx: 62, durationMs: 950, stroke: '#4a0808', strokeThickness: 7 },
  hurt: { color: '#c07dff', fontSize: 26, fontStyle: 'bold', risePx: 46, durationMs: 800, stroke: '#2c0a4a', strokeThickness: 5 },
  heal: { color: '#5ef07a', fontSize: 24, fontStyle: 'bold', risePx: 44, durationMs: 780, stroke: '#0e3a14', strokeThickness: 5 },
  burn: { color: '#ff7a4d', fontSize: 22, fontStyle: 'bold', risePx: 36, durationMs: 680, stroke: '#3a1408', strokeThickness: 4 },
  exp: { color: '#c8b0ff', fontSize: 18, fontStyle: 'bold', risePx: 32, durationMs: 700, stroke: '#241a3a', strokeThickness: 4 },
} as const

export type FloatKind = keyof typeof FLOAT_STYLES

export interface TextureRef {
  key: string
  url: string
}

const UI = 'assets/extracted/ui/'
const ICON = 'assets/extracted/icons/'

/** All HUD art keys. A host scene iterates this in preload(). */
export const HUD_TEXTURES: TextureRef[] = [
  { key: 'hud_avatar_wukong', url: `${UI}hud_avatar_wukong.png` }, // extracted RoleInfo avatar (ink-framed 悟空 portrait)
  { key: 'hud_boss_bar_fill', url: `${UI}hud_boss_bar_fill.png` }, // extracted boss red-brush fill
  { key: 'hud_ink_band', url: `${UI}dialogue_textpanel_crop.png` }, // procedurally generated ink-brush band for toasts/dialogue (see Toast.ts header -- this file used to be a dirty cutscene-screenshot crop)
  // S4: full BackPack window chrome, re-extracted from backpack1.swf's
  // export.pack.BackPack (chid444) default-state render — every baked button/
  // label/tab/stat-box comes from this one image; only dynamic text, the exp
  // fill, level digits, portrait and item icons are drawn on top (see
  // BackpackWindow.ts + tasks/profile-backpack-report.md).
  { key: 'backpack_bg', url: `${UI}backpack_bg.png` }, // 755x497 window chrome
  { key: 'backpack_exp_fill', url: `${UI}backpack_exp_fill.png` }, // EXP bar gold fill (frame 30 of mc_exp, cropped to content), setCrop by fraction
  { key: 'backpack_slot', url: `${UI}backpack_slot.png` }, // 5x5 grid cell backdrop (export.pack.PackThings, chid114)
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => ({ key: `backpack_digit_${d}`, url: `${UI}backpack_digit_${d}.png` })), // levelnum0-9 (level badge digits)
  { key: 'furnace_making', url: `${UI}furnace_making.png` }, // 制作 craft panel (export.strength.Making)
  { key: 'furnace_fusion', url: `${UI}furnace_fusion.png` }, // 合成 fusion panel (export.strength.Fusion)
  { key: 'furnace_frame', url: `${UI}furnace_frame.png` }, // 炼丹炉 ink window frame (official StrengthEquipment 打造 tab header)
  { key: 'skilldock', url: `${UI}hud_roleinfo_bottom_skilldock.png` }, // 无双 + 法宝/宠物/技能/青包/设置 + 5 empty slots (export.RoleInfo bottom)
  // export.RoleInfo sub-parts (FFDec, OtherMat1 chid264/297/300/303) — ink bg
  // (avatar blob + 3 tapered bar tracks + level ring) and the red/blue/gold bar
  // fills, assembled at the SWF object-tree coordinates.
  { key: 'hud_ri_bg', url: `${UI}hud_ri_bg.png` },
  { key: 'hud_ri_head', url: `${UI}hud_ri_head.png` },
  { key: 'hud_ri_hp', url: `${UI}hud_ri_hp.png` },
  { key: 'hud_ri_mp', url: `${UI}hud_ri_mp.png` },
  { key: 'hud_ri_exp', url: `${UI}hud_ri_exp.png` },
  { key: 'hud_ri_rage', url: `${UI}hud_ri_rage.png` }, // chid262 怒气/无双 charge meter (rendered empty — no rage system yet)
]

/** Item icon keys (21 extracted). Host scene loads these; BackpackWindow maps item.id -> key. */
export const HUD_ICON_IDS = [
  'beast_fang', 'black_iron', 'bone_shard', 'bronze_plate', 'clear_pill', 'cotton_robe',
  'cracked_jade', 'crafted_equip', 'demon_soul', 'fallback', 'great_pill', 'guard_boots',
  'iron_claw', 'medium_pill', 'minor_pill', 'monkey_talisman', 'moon_dew', 'silver_ore',
  'spirit_grass', 'star_blade', 'torn_charm',
] as const

export const HUD_ICONS: TextureRef[] = HUD_ICON_IDS.map((id) => ({ key: `icon_${id}`, url: `${ICON}${id}.png` }))

export const ICON_FALLBACK_KEY = 'icon_fallback'

// ---- Online-sourced textures (系列后作素材) ----
// No legal/distribution restriction (CLAUDE.md: 用户是造梦团队成员，全系列可用).
// Kept in a separate list + dir only to DISTINGUISH SOURCE for a packaging
// style-consistency review (造3 本体 vs Online 后作，避免缝合感). Components that
// consume these declare `export const ASSET_SOURCE_ONLINE = true` for grep.
// See game/public/assets/online/ASSET-SOURCES.md.
const ONLINE = 'assets/online/'

/** Role1 skill-icon keys (`skill_<id>`), symbol-matched to heroSkill.ts Role1SkillId. */
export const ROLE1_SKILL_IDS = ['slz', 'lys', 'hytj', 'lyfb', 'jdy', 'qsez', 'zz', 'hmz', 'hyjj'] as const
/** The 9 actives plus `sx`, matching skillTree.ts's Role1TreeSkillId -- the
 * full set of skill-tree table rows (S5). */
export const ROLE1_TREE_SKILL_IDS = [...ROLE1_SKILL_IDS, 'sx'] as const

export const ONLINE_TEXTURES: TextureRef[] = [
  // Dock icons use the brighter RoleSkillInterface skill-tree icons (sb_*, 66px,
  // edge-to-edge fire, no baked frame) rather than the darker framed ss_* set.
  ...ROLE1_SKILL_IDS.map((id) => ({ key: `skill_${id}`, url: `${ONLINE}skill-icons/sb_${id}.png` })),
  // sx has no sb_* (bright dock) variant in the extracted set -- only the
  // darker framed ss_* one -- so the S5 skill-tree table (which needs an icon
  // for all 10 school-tree rows, not just the 9 dockable actives) uses ss_sx
  // for this one row. Asset-gap note, not a fidelity regression: sx never
  // renders on the battle dock anyway (it's a passive, see skillTree.ts).
  { key: 'skill_sx', url: `${ONLINE}skill-icons/ss_sx.png` },
  { key: 'result_success', url: `${ONLINE}results/challenge-success.png` },
  { key: 'result_fail', url: `${ONLINE}results/challenge-fail.png` },
  { key: 'result_my', url: `${ONLINE}results/my-results-banner.png` },
  { key: 'result_retry', url: `${ONLINE}results/retry-button.png` },
]
