import { z } from 'zod'

const CONTENT_ID_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/

export const ContentIdSchema = z.string().regex(CONTENT_ID_PATTERN).brand<'ContentId'>()
export type ContentId = z.infer<typeof ContentIdSchema>

export const RuleOriginSchema = z.enum(['canonical', 'adapted', 'invented'])
export type RuleOrigin = z.infer<typeof RuleOriginSchema>

export const RuleProvenanceSchema = z
  .object({
    ruleId: z.string().min(1),
    source: z.string().min(1),
    origin: RuleOriginSchema,
  })
  .strict()
export type RuleProvenance = z.infer<typeof RuleProvenanceSchema>

export function defineContentId(value: string): ContentId {
  return ContentIdSchema.parse(value)
}

export function assertUniqueContentIds(ids: readonly ContentId[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error('duplicate content id')
  }
}
