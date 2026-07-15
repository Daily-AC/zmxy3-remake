export type BattleRuntimeSelection = 'legacy' | 'production'

export function battleRuntimeForCampaign(
  campaignIndex: number,
  search: string,
): BattleRuntimeSelection {
  const params = new URLSearchParams(search)
  return campaignIndex >= 0 && campaignIndex <= 2 && params.get('battleRuntime') === '1'
    ? 'production'
    : 'legacy'
}
