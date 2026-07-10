export interface BattleLoadingContext {
  readonly campaignIndex: number
  readonly name: string
  readonly label: string
  readonly context: string
}

const CAMPAIGN_NAMES = ['九重天', '天宫道', '二郎神关', '邪念之境'] as const
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
