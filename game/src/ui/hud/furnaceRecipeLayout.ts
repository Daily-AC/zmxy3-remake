export const LAOJUN_PORTRAIT_TEX = 'wm_laojun_portrait'
export const LAOJUN_PORTRAIT_CROP = { x: 75, y: 35, w: 150, h: 150 } as const

export interface LaojunHeaderLayout {
  nameX: number
  nameY: number
  portraitX: number
  portraitY: number
  portraitSize: number
  chatViewportY: number
}

export function laojunHeaderLayout(): LaojunHeaderLayout {
  return {
    nameX: 720,
    nameY: 126,
    portraitX: 720,
    portraitY: 164,
    portraitSize: 56,
    chatViewportY: 200,
  }
}
