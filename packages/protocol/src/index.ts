export const PROTOCOL_VERSION = 'combat-session@1' as const

export interface ProtocolEnvelope<TPayload> {
  protocolVersion: typeof PROTOCOL_VERSION
  sequence: number
  payload: TPayload
}
