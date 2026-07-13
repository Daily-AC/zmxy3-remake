export const SAVE_SCHEMA_VERSION = 'profile@1' as const

export interface SaveEnvelope<TData> {
  saveSchemaVersion: typeof SAVE_SCHEMA_VERSION
  data: TData
}
