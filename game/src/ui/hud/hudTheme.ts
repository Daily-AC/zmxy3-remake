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
export const FLOAT_STYLES = {
  damage: { color: '#ffe37a', fontSize: 18, fontStyle: 'bold', risePx: 34, durationMs: 700, stroke: '#3a2410', strokeThickness: 3 },
  crit: { color: '#ff2d2d', fontSize: 34, fontStyle: 'bold', risePx: 52, durationMs: 900, stroke: '#4a0808', strokeThickness: 5 },
  heal: { color: '#6ef07a', fontSize: 18, fontStyle: 'bold', risePx: 34, durationMs: 700, stroke: '#123a16', strokeThickness: 3 },
  burn: { color: '#ff7a4d', fontSize: 17, fontStyle: 'bold', risePx: 30, durationMs: 650, stroke: '#3a1408', strokeThickness: 3 },
  exp: { color: '#c8b0ff', fontSize: 16, fontStyle: 'bold', risePx: 30, durationMs: 700, stroke: '#241a3a', strokeThickness: 3 },
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
  { key: 'hud_ink_band', url: `${UI}dialogue_textpanel_crop.png` }, // 水墨 text band for toasts
  { key: 'backpack_window', url: `${UI}backpack_window_crop.png` }, // cropped 个人资料/背包 window
  { key: 'backpack_slot', url: `${UI}backpack_slot_cell.png` }, // single grid cell
  { key: 'furnace_making', url: `${UI}furnace_making.png` }, // 制作 craft panel (export.strength.Making)
  { key: 'furnace_fusion', url: `${UI}furnace_fusion.png` }, // 合成 fusion panel (export.strength.Fusion)
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

export const ONLINE_TEXTURES: TextureRef[] = [
  ...ROLE1_SKILL_IDS.map((id) => ({ key: `skill_${id}`, url: `${ONLINE}skill-icons/ss_${id}.png` })),
  { key: 'result_success', url: `${ONLINE}results/challenge-success.png` },
  { key: 'result_fail', url: `${ONLINE}results/challenge-fail.png` },
  { key: 'result_my', url: `${ONLINE}results/my-results-banner.png` },
  { key: 'result_retry', url: `${ONLINE}results/retry-button.png` },
]
