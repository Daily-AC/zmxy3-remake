export type BattleRuntimeSelection = 'legacy' | 'production'

export function battleRuntimeForCampaign(
  campaignIndex: number,
  search: string,
): BattleRuntimeSelection {
  const params = new URLSearchParams(search)
  const isChapterOne = campaignIndex >= 0 && campaignIndex <= 2
  const forceLegacy = params.get('battleRuntime') === 'legacy'
  return isChapterOne && !forceLegacy ? 'production' : 'legacy'
}
