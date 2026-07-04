import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, runMigrations, type DB } from '../../src/main/db/index'

export interface TestDb {
  db: DB
  dir: string
  cleanup: () => void
}

/** Fresh migrated SQLite DB in a temp dir. Call cleanup() when done. */
export function makeTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'ccm-test-'))
  const { db } = openDatabase(join(dir, 'test.db'))
  runMigrations(db, join(process.cwd(), 'drizzle'))
  return { db, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
