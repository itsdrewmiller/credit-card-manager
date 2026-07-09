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
  },
  {
    key: 'rule_seed.max_recent_apps_issuer_chase.v1',
    kind: 'max_recent_apps_issuer',
    params: { issuer: 'Chase', months: 1, max: 1 },
    notes:
      'Chase sees personal and business applications on one profile (personal guarantee), and heavy velocity risks a shutdown review — at least 30 days between any two Chase applications per person, across all entities.'
  },
  {
    key: 'rule_seed.max_recent_apps_issuer_chase_business.v1',
    kind: 'max_recent_apps_issuer',
    params: { issuer: 'Chase', months: 3, max: 1, businessOnly: true },
    notes:
      "Post-crackdown consensus: ~90 days between Chase business applications per person. A second entity doesn't get its own lane — it's the same queue under your SSN."
  },
  {
    key: 'rule_seed.max_open_matching_chase_ink.v1',
    kind: 'max_open_matching',
    params: { issuer: 'Chase', match: ['ink'], max: 3 },
    notes:
      'Open Ink count is the real approval ceiling: 4+ open Inks (across all businesses) drives denials. Close one before applying — low utilization on existing Inks also hurts.'
  },
  {
    key: 'rule_seed.family_bonus_order_chase_ink.v1',
    kind: 'family_bonus_order',
    params: {
      families: [
        {
          label: 'Chase Ink (no annual fee)',
          issuer: 'Chase',
          include: ['ink'],
          exclude: ['preferred', 'premier'],
          tiers: ['ink']
        },
        { label: 'Chase Ink Preferred', issuer: 'Chase', include: ['ink', 'preferred'], tiers: ['ink'] },
        { label: 'Chase Ink Premier', issuer: 'Chase', include: ['ink', 'premier'], tiers: ['ink'] }
      ]
    },
    notes:
      "Chase's Nov 2025 bonus rules: a no-AF Ink bonus is dead if you've ever had ANY no-AF Chase business card (any entity — eligibility follows you, not the EIN); annual-fee Inks are once-ever per exact card. Enforcement consistency is still unclear, so don't build on a second EIN for a repeat bonus."
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
