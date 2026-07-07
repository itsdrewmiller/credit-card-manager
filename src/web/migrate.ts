import type { Database } from 'sql.js'
import journal from '../../drizzle/meta/_journal.json'

// All migration SQL ships in the bundle, keyed by file path.
const migrationSql = import.meta.glob('../../drizzle/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Browser port of drizzle's sqlite migrator: same __drizzle_migrations
 * bookkeeping (hash + journal timestamp), same statement-breakpoint
 * splitting, so a database file is interchangeable with one migrated by the
 * Electron build.
 */
export async function runMigrationsWeb(sqlite: Database): Promise<number> {
  sqlite.run(
    'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)'
  )
  const res = sqlite.exec(
    'SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1'
  )
  const lastApplied = Number(res[0]?.values[0]?.[0] ?? 0)

  let applied = 0
  for (const entry of journal.entries) {
    if (entry.when <= lastApplied) continue
    const path = Object.keys(migrationSql).find((p) => p.endsWith(`/${entry.tag}.sql`))
    if (!path) throw new Error(`Missing bundled migration ${entry.tag}`)
    const content = migrationSql[path]
    sqlite.run('BEGIN')
    try {
      for (const statement of content.split('--> statement-breakpoint')) {
        const trimmed = statement.trim()
        if (trimmed) sqlite.run(trimmed)
      }
      sqlite.run(
        'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)',
        [await sha256Hex(content), entry.when]
      )
      sqlite.run('COMMIT')
    } catch (err) {
      sqlite.run('ROLLBACK')
      throw err
    }
    applied++
  }
  return applied
}
