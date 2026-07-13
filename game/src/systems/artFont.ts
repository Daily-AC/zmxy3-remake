// Art-font loading for text that should read as 造梦世界's hand-drawn/ink
// aesthetic rather than the browser's generic sans-serif fallback (main-menu
// title, menu items, S2 select-role "敬请期待" labels, and going forward the
// full UI text layer per CLAUDE.md 总纲 item 0 -- "全 UI 毛笔书法字体，方正
// 字体=AI 味不切景"). Narrowed 2026-07-08 evening to calligraphy/brush-only
// candidates (an earlier round had two non-brush Google Fonts here --
// ZCOOL KuaiLe/QingKe HuangYou, dropped per user redirect, "弃掉不心疼").
//
// Licensing, verified by fetching each font's PRIMARY source page directly
// (not trusting search-result summaries -- one of them was actively wrong,
// see below):
//   - `mashan` (Ma Shan Zheng): Google Fonts, SIL Open Font License 1.1.
//   - `qiuhongkai`/`xiaxingkai` (演示秋鸿楷/演示夏行楷): individual authors'
//     public "免费商用" (free-for-commercial-use) declarations via 猫啃网
//     (maoken.com), NOT a standardized OSS license. A web-search snippet for
//     both claimed "嵌入式应用" (embedded/software/game use) was excluded --
//     directly fetching the primary maoken.com page for each shows the
//     opposite: their license table explicitly marks embedded
//     apps/games/web/H5 etc. as permitted (✓ 可以). See
//     public/assets/fonts/LICENSE-{QiuHongKai,XiaXingKai}.txt for the full
//     quoted terms and source URLs -- don't re-trust a search snippet for
//     this font family without re-checking the primary page.
export interface ArtFontCandidate {
  id: string
  family: string
  file: string // relative to public/assets/fonts/
  note: string
}

export const ART_FONT_CANDIDATES: ArtFontCandidate[] = [
  {
    id: 'mashan',
    family: 'Ma Shan Zheng',
    file: 'MaShanZheng-UI.woff2',
    note: '马善政毛笔行书 -- 流畅飘逸，笔画偏细，呼应选人屏/对话框的墨迹水墨气质；Google Fonts OFL，零许可风险',
  },
  {
    id: 'qiuhongkai',
    family: 'Yanshi QiuHongKai',
    file: 'QiuHongKai-Regular.ttf',
    note: '演示秋鸿楷 -- 楷书结构，笔触粗实、书写端正大气，标题辨识度最强的一款',
  },
  {
    id: 'xiaxingkai',
    family: 'Yanshi XiaXingKai',
    file: 'XiaXingKai-Regular.ttf',
    note: '演示夏行楷 -- 行楷，笔画灵动连贯、转折圆滑，比马善政更饱满、比秋鸿楷更潇洒',
  },
]

// TODO(main session pick): flip this id to re-skin every art-font consumer at
// once (MainMenuScene title/menu, CharacterSelectScene locked-panel labels).
// Side-by-side candidate screenshots: game/tmp/debug-shots/font-*.png, and
// the comparison table lives in tasks/verdict-fixes-report.md §字体方案.
// Defaulted to `mashan` per the imperceptibility-gaps.md ledger's existing
// direction ("切毛笔字体（马善政）") -- zero licensing risk (Google/OFL) and
// already the leading candidate; qiuhongkai/xiaxingkai are real alternatives
// if the main session prefers a bolder/more upright brush look.
export const ACTIVE_ART_FONT_ID = 'mashan'

export function activeArtFont(): ArtFontCandidate {
  return ART_FONT_CANDIDATES.find((f) => f.id === ACTIVE_ART_FONT_ID) ?? ART_FONT_CANDIDATES[0]
}

export function artFontById(id: string): ArtFontCandidate {
  return ART_FONT_CANDIDATES.find((f) => f.id === id) ?? ART_FONT_CANDIDATES[0]
}

let loaded: Promise<void> | null = null

/**
 * Register + load the active font before any Phaser Text using it is created.
 * Canvas text silently falls back to the default font if
 * you draw before the FontFace finishes loading, and Phaser Text doesn't
 * re-measure/redraw on its own once the font swaps in later. Memoized so
 * every scene can call this in create() for free after the first time. Loading
 * inactive candidates here used to block boot on roughly 30 MiB of fonts.
 */
export function ensureArtFontsLoaded(): Promise<void> {
  if (loaded) return loaded
  const fontsApi = (document as unknown as { fonts?: { add: (f: FontFace) => void } }).fonts
  if (!fontsApi || typeof FontFace === 'undefined') {
    loaded = Promise.resolve()
    return loaded
  }
  loaded = Promise.all(
    [activeArtFont()].map((c) => {
      const face = new FontFace(c.family, `url(assets/fonts/${c.file}) format("woff2")`)
      fontsApi.add(face)
      return face
        .load()
        .then(() => undefined)
        .catch(() => undefined) // non-fatal: worst case that candidate falls back to default font
    }),
  ).then(() => undefined)
  return loaded
}
