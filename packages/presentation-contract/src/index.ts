export const PRESENTATION_CONTRACT_VERSION = 'presentation@1' as const

export interface PresentationCue<TType extends string, TPayload> {
  presentationVersion: typeof PRESENTATION_CONTRACT_VERSION
  tick: number
  type: TType
  payload: TPayload
}
