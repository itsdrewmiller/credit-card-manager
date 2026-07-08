import { sql } from 'drizzle-orm'
import type { DbLike } from './index'
import { recommendationRule } from './schema'
import { getSetting, setSetting } from './settings'

/**
 * Seed the default recommendation rules (data/default_rules.json, passed as
 * its JSON text so this runs in both Electron and the browser) when the
 * table is empty — first run only, so user edits and deletions stick.
 */
export function seedDefaultRules(db: DbLike, rulesJson: string | null): number {
  const count =
    db.select({ n: sql<number>`count(*)` }).from(recommendationRule).get()?.n ?? 0
  if (count > 0 || !rulesJson) return 0

  const rules = JSON.parse(rulesJson) as {
    kind: string
    params?: Record<string, unknown>
    notes?: string
  }[]
  for (const r of rules) {
    db.insert(recommendationRule)
      .values({ kind: r.kind, params: JSON.stringify(r.params ?? {}), notes: r.notes ?? null })
      .run()
  }
  return rules.length
}

/**
 * Rules added after a database already exists. seedDefaultRules only runs on
 * an empty table, so each later addition seeds at most once via its own
 * app_setting key (same pattern as seeded referral links) — deleting or
 * editing the rule sticks across boots.
 */
const RULE_ADDITIONS: { key: string; kind: string; params: Record<string, unknown>; notes: string }[] = [
  {
    key: 'rule_seed.family_bonus_order.v1',
    kind: 'family_bonus_order',
    params: {},
    notes:
      "Amex family rules: collect bonuses bottom-up (Green→Gold→Platinum; Delta, Hilton, and Blue Cash are separate families). Graphite is assumed above Platinum — edit params with custom families if Amex publishes different terms."
  }
]

export function seedRuleAdditions(db: DbLike): number {
  let added = 0
  for (const r of RULE_ADDITIONS) {
    if (getSetting(db, r.key) != null) continue
    db.insert(recommendationRule)
      .values({ kind: r.kind, params: JSON.stringify(r.params), notes: r.notes })
      .run()
    setSetting(db, r.key, '1')
    added++
  }
  return added
}
