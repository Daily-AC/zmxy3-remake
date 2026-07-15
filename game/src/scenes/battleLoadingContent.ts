export interface BattleLoadingContext {
  readonly campaignIndex: number
  readonly name: string
  readonly label: string
  readonly context: string
}

export interface BattleLoadingBackground {
  readonly key: string
  readonly url: string
}

export const BATTLE_LOADING_BACKGROUNDS = [
  { key: 'loading_nine_heavens', url: 'assets/generated/loading-nine-heavens.webp' },
  { key: 'loading_heavenly_palace', url: 'assets/generated/loading-heavenly-palace.webp' },
] as const satisfies readonly BattleLoadingBackground[]

const CAMPAIGN_NAMES = ['九重天', '天宫道', '南天门', '二郎神关', '邪念之境'] as const
const DOTS = ['', '.', '..', '...'] as const

export function battleLoadingContext(index: number): BattleLoadingContext {
  const wholeIndex = Number.isFinite(index) ? Math.floor(index) : 0
  const campaignIndex = Math.min(Math.max(wholeIndex, 0), CAMPAIGN_NAMES.length - 1)
  const name = CAMPAIGN_NAMES[campaignIndex]
  return {
    campaignIndex,
    name,
    label: `第 ${campaignIndex + 1} 关 · ${name}`,
    context: `正在推演${name}`,
  }
}

export function battleLoadingStatusFrames(coop: boolean): readonly string[] {
  const phrases = ['校准云路', '推演妖阵', coop ? '召集同伴' : '整备行囊'] as const
  return phrases.flatMap((phrase) => DOTS.map((dots) => `${phrase}${dots}`))
}

export function battleLoadingBackground(index: number): BattleLoadingBackground {
  return BATTLE_LOADING_BACKGROUNDS[index === 1 || index === 2 ? 1 : 0]
}
