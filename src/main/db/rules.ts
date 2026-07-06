import { readFileSync, existsSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import type { DbLike } from './index'
import { recommendationRule } from './schema'

/**
 * Seed the default recommendation rules (data/default_rules.json) when the
 * table is empty — first run only, so user edits and deletions stick.
 */
export function seedDefaultRules(db: DbLike, jsonPath: string): number {
  const count =
    db.select({ n: sql<number>`count(*)` }).from(recommendationRule).get()?.n ?? 0
  if (count > 0 || !existsSync(jsonPath)) return 0

  const rules = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
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
