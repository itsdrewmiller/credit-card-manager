import { sql } from 'drizzle-orm'
import type { DbLike } from './index'
import { recommendationRule } from './schema'

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
