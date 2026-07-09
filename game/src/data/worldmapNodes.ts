// S1 世界地图 layout data, straight from the dual-source extraction documented
// in tasks/worldmap-report.md:
//   - skin: `export.SelectPLace`'s own timeline (Symbol 979 in
//     out_res/OtherMat1.swf, linkageClassName confirms the match) -- every
//     x/y below is that symbol's PlaceObject `Matrix tx/ty` (already px, xfl
//     export), i.e. the exact stage position FFDec reports, not a
//     screenshot-eyeballed guess.
//   - bone: `export.SelectPLace`'s AS3 (main SWF) -- node naming protocol
//     `s{bigStage}_{bigLevel}`, the three-frame state machine
//     (1=normal/locked-look, 2=current, 3=hover), and which nodes get click
//     listeners (`added()`'s nested loop, stage 1..curBigStage).
//
// The original stage is 940x590px (SWF header: displayRect 18800x11800
// twips); our canvas is 960x540. All positions here stay in the *original*
// 940x590 space -- WorldMapScene wraps them in one scaled+offset container
// (see `worldMapTransform`) rather than pre-multiplying every constant, so
// this table stays a literal transcript of the xfl matrix.

export type WorldMapNodeKind = 'campaign' | 'locked'

export interface WorldMapNode {
  /** export.SelectPLace instance name (s{bigStage}_{bigLevel}). */
  id: string
  x: number
  y: number
  kind: WorldMapNodeKind
  /** 0-based index into BattleScene's CAMPAIGN array; only set for kind:'campaign'. */
  campaignIndex?: number
  textureNormal: string
  textureCurrent?: string
  textureHover?: string
}

/** The 12 node slots export.SelectPLace declares (s1_1..s4_3). Our shipped
 * CAMPAIGN chain only has 4 levels, so the first 4 nodes in the AS3's own
 * stage-major/level-minor order (s1_1 -> s1_2 -> s1_3 -> s2_1, the order
 * `added()` walks and unlocks in) map onto CAMPAIGN[0..3]; the remaining
 * s2_2/s2_3/s3_1-3 render as locked decoration (real xfl position + real art,
 * never clickable -- no gameplay exists behind them). s4_1-3 (symbol 848) are
 * excluded entirely: their placement (y=674.2) is below the 590px stage and
 * their exported art is blank/transparent -- nothing to honestly render.
 */
export const WORLDMAP_NODES: WorldMapNode[] = [
  {
    id: 's1_1',
    x: 703.45,
    y: 524.95,
    kind: 'campaign',
    campaignIndex: 0,
    textureNormal: 'wm_node_s1_1_normal',
    textureCurrent: 'wm_node_s1_1_current',
    textureHover: 'wm_node_s1_1_hover',
  },
  {
    id: 's1_2',
    x: 596.5,
    y: 541.95,
    kind: 'campaign',
    campaignIndex: 1,
    textureNormal: 'wm_node_s1_2_normal',
    textureCurrent: 'wm_node_s1_2_current',
    textureHover: 'wm_node_s1_2_hover',
  },
  // s1_3/s2_1 (campaignIndex 2/3 -- L3/L4): kept `kind: 'campaign'` and real
  // art/position (not converted to `kind: 'locked'` decoration) because the
  // scope cut is an ENTRY-POINT cap, not a "this content doesn't exist"
  // removal -- level3.ts/level4.ts and BattleScene's CAMPAIGN[2]/[3] stay in
  // the codebase per the user's "留库" instruction. The lock is enforced
  // upstream in systems/campaignProgress.ts (ACTIVE_CAMPAIGN_LENGTH=2 caps
  // every index this module hands out), so these two nodes' currentIndex can
  // structurally never reach 2, and campaignNodeVisualState() always resolves
  // them to 'locked' -- same grey-tint render path as s2_2/s2_3/s3_1-3 below,
  // zero changes needed here or in WorldMapScene's rendering.
  {
    id: 's1_3',
    x: 525.45,
    y: 458.45,
    kind: 'campaign',
    campaignIndex: 2,
    textureNormal: 'wm_node_s1_3_normal',
    textureCurrent: 'wm_node_s1_3_current',
    textureHover: 'wm_node_s1_3_hover',
  },
  {
    id: 's2_1',
    x: 507.95,
    y: 341.5,
    kind: 'campaign',
    campaignIndex: 3,
    textureNormal: 'wm_node_s2_1_normal',
    textureCurrent: 'wm_node_s2_1_current',
    textureHover: 'wm_node_s2_1_hover',
  },
  { id: 's2_2', x: 323.45, y: 325.0, kind: 'locked', textureNormal: 'wm_node_s2_2_normal' },
  { id: 's2_3', x: 483.95, y: 240.0, kind: 'locked', textureNormal: 'wm_node_s2_3_normal' },
  { id: 's3_1', x: 611.95, y: 190.0, kind: 'locked', textureNormal: 'wm_node_s3_1_normal' },
  { id: 's3_2', x: 421.45, y: 143.0, kind: 'locked', textureNormal: 'wm_node_s3_2_normal' },
  { id: 's3_3', x: 419.45, y: 38.0, kind: 'locked', textureNormal: 'wm_node_s3_3_normal' },
]

export const WORLDMAP_CAMPAIGN_NODES = WORLDMAP_NODES.filter(
  (n): n is WorldMapNode & { kind: 'campaign'; campaignIndex: number } => n.kind === 'campaign',
)

/** Special landmark buildings from export.SelectPLace: each has real AS3
 * gating logic (dsgbtn/斗兽场-style needs player level>=40, btnnmg/南天门
 * needs curBigStage>=3, llbt/玲珑塔 needs curBigStage>=4, kls/昆仑山 spends a
 * 灵魂 currency we don't have, sgzz opens a whole separate Sgzzinterface) --
 * none of the systems those gates check (soul currency, a stage>4 campaign,
 * an alternate interface) exist in this port, so per the S1 brief these are
 * real position + real art, locked/decorative, never clickable ("按未解锁置灰
 * 渲染占位，不造假可点"). `scale` is the instance's own PlaceObject scale on
 * top of the shared container scale (only sgzz has one, from its Matrix a/d).
 */
export interface WorldMapDecoration {
  id: string
  x: number
  y: number
  textureNormal: string
  scale?: number
}

export const WORLDMAP_DECORATIONS: WorldMapDecoration[] = [
  { id: 'dsgbtn', x: 144.5, y: 107.5, textureNormal: 'wm_deco_dsgbtn' },
  { id: 'llbt', x: 170.95, y: 212.75, textureNormal: 'wm_deco_llbt' },
  { id: 'sgzz', x: 783.0, y: 137.8, textureNormal: 'wm_deco_sgzz', scale: 1.552 },
  { id: 'btnnmg', x: 894.9, y: 409.0, textureNormal: 'wm_deco_btnnmg' },
  { id: 'kls', x: 829.5, y: 510.45, textureNormal: 'wm_deco_kls' },
  { id: 'sssl', x: 204.7, y: 446.45, textureNormal: 'wm_deco_sssl' },
]

// Removed 2026-07-08 (user verdict, visual-feedback round): the two top-left/
// top-right "补偿礼包" chests were a live-ops/promo element (compensation
// gift packages tied to server events we don't run), never clickable in this
// port to begin with. User called it out as ops chrome that doesn't belong
// in an offline single-player remake -- dropped data + rendering entirely
// rather than leaving dead decorative art. Real position/art were previously
// correct (see tasks/worldmap-report.md); this is a scope cut, not a bug fix.

export type WorldMapButtonAction = 'save' | 'shop' | 'furnace' | 'skills' | 'activity' | 'tasks' | 'back' | 'coop'

export interface WorldMapButton {
  id: string
  x: number
  y: number
  texture: string
  action: WorldMapButtonAction
  label: string
  /** Buttons with real behavior this milestone; the rest render + toast
   * "敬请期待" (screen-fidelity-spec.md S1: 商城/活动/任务/学习技能 置灰). */
  enabled: boolean
}

export const WORLDMAP_BUTTONS: WorldMapButton[] = [
  { id: 'savebtn', x: -1.0, y: 506.0, texture: 'wm_btn_save', action: 'save', label: '保存游戏', enabled: true },
  { id: 'scgm', x: 66.0, y: 506.0, texture: 'wm_btn_shop', action: 'shop', label: '商城', enabled: false },
  { id: 'ldl', x: 131.95, y: 506.0, texture: 'wm_btn_furnace', action: 'furnace', label: '炼丹炉', enabled: true },
  {
    id: 'showBuySkill',
    x: 197.95,
    y: 506.0,
    texture: 'wm_btn_skills',
    action: 'skills',
    label: '学习技能',
    enabled: true, // S5: SkillTreeScene lands (tasks/skilltree-report.md).
  },
  {
    // 原版语义=难度切换（AS3 huodongClick() 在 gc.difficulity 0/1 间切换出怪难度，
    // 不是"活动"内容面板 -- tasks/worldmap-report.md 逐条核对表）。用户拍板赛内
    // 置灰，标签沿用参照图的"活动"文案，2026-07-08。将来想做真活动系统或接回
    // 难度切换，直接改 action/enabled，坐标/贴图不用动。
    id: 'huodongbtn',
    x: 263.95,
    y: 506.0,
    texture: 'wm_btn_activity',
    action: 'activity',
    label: '活动',
    enabled: false,
  },
  { id: 'rwbtn', x: 329.95, y: 506.95, texture: 'wm_btn_tasks', action: 'tasks', label: '任务', enabled: false },
  { id: 'btnback', x: 396.95, y: 508.0, texture: 'wm_btn_back', action: 'back', label: '返回', enabled: true },
  {
    // 联机共斗（黑客松新增，无 vendor 真源按钮）：素材是照 vendor 底栏按钮
    // DNA（红球+金环+金图标+描边白字标签）用 PIL 合成的 btn_coop.png（双剑交叉
    // 图标），坐标接在 vendor 一排（间距 66px）的 返回 之后 —— 用户拍板从右上角
    // 悬浮 MenuButton 收进左下角这一列（2026-07-09）。
    id: 'coopbtn',
    x: 462.95,
    y: 506.0,
    texture: 'wm_btn_coop',
    action: 'coop',
    label: '联机共斗',
    enabled: true,
  },
]

/** Original stage size (SWF header, twips/20). */
export const WORLDMAP_STAGE_W = 940
export const WORLDMAP_STAGE_H = 590

export interface WorldMapTransform {
  scale: number
  offsetX: number
  offsetY: number
}

/**
 * Contain-fit the 940x590 original stage into the game's 960x540 canvas:
 * scale by the binding (height) dimension and pillarbox the leftover width,
 * rather than cropping. An earlier cover-fit-width version cropped ~62px off
 * the stage's height to fill the canvas -- team-lead review (2026-07-08)
 * caught that this deletes real content the original always shows in full
 * (the two corner 补偿礼包 chests were clipped, the topmost temple's roofline
 * went off-canvas). Cropping baked content is strictly worse than a ~50px
 * black pillarbox bar on each side, which loses nothing and introduces no
 * distortion. Every node/decoration/button coordinate stays the literal xfl
 * Matrix value; only this shared transform changed.
 */
export function worldMapTransform(canvasW: number, canvasH: number): WorldMapTransform {
  const scale = canvasH / WORLDMAP_STAGE_H
  const offsetX = (canvasW - WORLDMAP_STAGE_W * scale) / 2
  const offsetY = 0
  return { scale, offsetX, offsetY }
}
