// Art-font loading for text that should read as 造梦世界's hand-drawn/ink
// aesthetic rather than the browser's generic sans-serif fallback (main-menu
// title, menu items, S2 select-role "敬请期待" labels). Team-lead brief
// 2026-07-08 ("字体方案") asked for 2-3 candidates implemented switchably so
// the main session can pick after reviewing side-by-side screenshots.
//
// All three candidates are Google Fonts (SIL Open Font License 1.1 -- free
// commercial embedding, no attribution required), vendored as local TTF files
// under public/assets/fonts/ so the game works offline/packaged (Tauri exe
// has no network). License text copied alongside each font file. Source:
// https://fonts.google.com/specimen/<Family%20Name>, files fetched from
// fonts.gstatic.com (see tasks/verdict-fixes-report.md for the exact URLs).
export interface ArtFontCandidate {
  id: string
  family: string
  file: string // relative to public/assets/fonts/
  note: string
}

export const ART_FONT_CANDIDATES: ArtFontCandidate[] = [
  { id: 'kuaile', family: 'ZCOOL KuaiLe', file: 'ZCOOLKuaiLe-Regular.ttf', note: '站酷快乐体 -- 圆润卡通感，贴合怪物/角色的Q版造型' },
  {
    id: 'huangyou',
    family: 'ZCOOL QingKe HuangYou',
    file: 'ZCOOLQingKeHuangYou-Regular.ttf',
    note: '站酷庆科黄油体 -- 加粗圆体，笔画更壮，标题辨识度更强',
  },
  { id: 'mashan', family: 'Ma Shan Zheng', file: 'MaShanZheng-Regular.ttf', note: '马善政毛笔行书 -- 呼应选人屏/对话框的墨迹水墨气质' },
]

// TODO(main session pick): flip this id to re-skin every art-font consumer at
// once (MainMenuScene title/menu, CharacterSelectScene locked-panel labels).
// Side-by-side candidate screenshots: game/tmp/debug-shots/font-*.png, and
// the comparison table lives in tasks/verdict-fixes-report.md §字体方案.
export const ACTIVE_ART_FONT_ID = 'huangyou'

export function activeArtFont(): ArtFontCandidate {
  return ART_FONT_CANDIDATES.find((f) => f.id === ACTIVE_ART_FONT_ID) ?? ART_FONT_CANDIDATES[0]
}

export function artFontById(id: string): ArtFontCandidate {
  return ART_FONT_CANDIDATES.find((f) => f.id === id) ?? ART_FONT_CANDIDATES[0]
}

let loaded: Promise<void> | null = null

/**
 * Register + load every candidate's @font-face before any Phaser Text using
 * them is created -- Canvas text silently falls back to the default font if
 * you draw before the FontFace finishes loading, and Phaser Text doesn't
 * re-measure/redraw on its own once the font swaps in later. Memoized so
 * every scene can call this in create() for free after the first time (the
 * files are local, so this resolves in well under a frame once cached).
 */
export function ensureArtFontsLoaded(): Promise<void> {
  if (loaded) return loaded
  const fontsApi = (document as unknown as { fonts?: { add: (f: FontFace) => void } }).fonts
  if (!fontsApi || typeof FontFace === 'undefined') {
    loaded = Promise.resolve()
    return loaded
  }
  loaded = Promise.all(
    ART_FONT_CANDIDATES.map((c) => {
      const face = new FontFace(c.family, `url(assets/fonts/${c.file})`)
      fontsApi.add(face)
      return face
        .load()
        .then(() => undefined)
        .catch(() => undefined) // non-fatal: worst case that candidate falls back to default font
    }),
  ).then(() => undefined)
  return loaded
}
