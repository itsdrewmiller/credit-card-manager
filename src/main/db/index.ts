import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import { schema } from './schema'

export type DB = BetterSQLite3Database<typeof schema>

/**
 * The root handle or a transaction from db.transaction() — both extend this
 * base. Read/write helpers accept DbLike so they compose into transactions
 * without casts.
 */
export type DbLike = BaseSQLiteDatabase<
  'sync',
  Database.RunResult,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>

export interface Db {
  db: DB
  sqlite: Database.Database
}

/**
 * Open (or create) the SQLite database at `dbPath` and return a Drizzle handle.
 * Path is injected so this can run both inside Electron (userData dir) and in
 * headless smoke tests (a temp file).
 */
export function openDatabase(dbPath: string): Db {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

/** Apply all generated migrations from `migrationsFolder`. */
export function runMigrations(db: DB, migrationsFolder: string): void {
  migrate(db, { migrationsFolder })
}
