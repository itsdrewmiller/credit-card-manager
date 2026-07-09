import { z } from 'zod'

/**
 * Per-kind parameter schemas for recommendation rules — the write-time
 * contract for the JSON `params` column. Strict objects: a misspelled key is
 * an error at save time, not a silent fall-through to the engine's defaults.
 * The engine (src/main/domain/recommend.ts) supplies the defaults; here every
 * field is optional but must be the right shape when present.
 */
export const RULE_PARAM_SCHEMAS = {
  no_duplicate_product: z.strictObject({ scope: z.enum(['holder']).optional() }),
  under_524: z.strictObject({ issuers: z.array(z.string()).nullable().optional() }),
  reserve_524_slots: z.strictObject({
    slots: z.number().int().min(1).optional(),
    forIssuers: z.array(z.string()).optional(),
    spendLastSlots: z.boolean().optional()
  }),
  max_recent_apps_person: z.strictObject({
    months: z.number().int().positive().optional(),
    max: z.number().int().min(1).optional()
  }),
  max_recent_apps_business: z.strictObject({
    months: z.number().int().positive().optional(),
    max: z.number().int().min(1).optional()
  }),
  max_recent_apps_issuer: z.strictObject({
    issuer: z.string().optional(),
    months: z.number().int().positive().optional(),
    max: z.number().int().min(1).optional(),
    businessOnly: z.boolean().optional()
  }),
  max_open_matching: z.strictObject({
    issuer: z.string().optional(),
    match: z.array(z.string()).min(1),
    max: z.number().int().min(1).optional()
  }),
  min_spend_capacity: z.strictObject({
    lookbackMonths: z.number().int().positive().optional(),
    buffer: z.number().positive().optional()
  }),
  min_bonus_value: z.strictObject({ minCents: z.number().int().min(0).optional() }),
  finish_open_bonuses: z.strictObject({
    maxOpenMonths: z.number().positive().optional(),
    lookbackMonths: z.number().int().positive().optional()
  }),
  family_bonus_order: z.strictObject({
    families: z
      .array(
        z.strictObject({
          label: z.string(),
          issuer: z.string().optional(),
          include: z.array(z.string()).optional(),
          exclude: z.array(z.string()).optional(),
          // A single tier models a lifetime group: ever holding any member
          // kills the welcome offer on all of them (e.g. Chase's no-AF Inks).
          tiers: z.array(z.string()).min(1)
        })
      )
      .optional()
  })
} as const

export type RuleKind = keyof typeof RULE_PARAM_SCHEMAS
export const RULE_KINDS = Object.keys(RULE_PARAM_SCHEMAS) as RuleKind[]

/** Validate a params JSON string for a rule kind. Returns an error message, or null when valid. */
export function ruleParamsError(kind: string, paramsJson: string): string | null {
  const schema = RULE_PARAM_SCHEMAS[kind as RuleKind]
  if (!schema) return `Unknown rule kind '${kind}'`
  let parsed: unknown
  try {
    parsed = JSON.parse(paramsJson)
  } catch {
    return 'Params must be valid JSON'
  }
  const r = schema.safeParse(parsed)
  if (r.success) return null
  return r.error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ')
}
