import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { drizzle } from 'drizzle-orm/sql-js'
import { schema } from '../main/db/schema'
import type { DB } from '../main/db'
import { runMigrationsWeb } from './migrate'
import { seedAll } from '../main/db/seedAll'
import offersCsv from '../../data/signup_bonuses.csv?raw'
import defaultRulesJson from '../../data/default_rules.json?raw'

const IDB_NAME = 'cardmanager'
const IDB_STORE = 'sqlite'
const IDB_KEY = 'main'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function loadBytes(): Promise<Uint8Array | null> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY)
    req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result) : null)
    req.onerror = () => reject(req.error)
  })
}

async function saveBytes(bytes: Uint8Array): Promise<void> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(bytes.buffer.slice(0), IDB_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export interface WebDb {
  db: DB
  sqlite: Database
  /** Debounced persist; call after every mutation. */
  persist: () => void
  /** Immediate persist, for pagehide/visibilitychange. */
  persistNow: () => Promise<void>
}

/**
 * The browser equivalent of openDatabase + runMigrations + seedAll: sql.js
 * (WASM SQLite, synchronous like better-sqlite3) with the whole database
 * persisted to IndexedDB. Local-only by design — cross-device sync is a
 * future paid feature and would slot in at this seam.
 */
export async function openWebDatabase(): Promise<WebDb> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const bytes = await loadBytes()
  const sqlite = bytes ? new SQL.Database(bytes) : new SQL.Database()
  sqlite.run('PRAGMA foreign_keys = ON')

  const applied = await runMigrationsWeb(sqlite)
  if (applied) console.log(`[web-db] applied ${applied} migrations`)

  // Structurally the same sync drizzle API the routers were written against;
  // only the driver's RunResult type differs.
  const db = drizzle(sqlite, { schema }) as unknown as DB
  seedAll(db, { offersCsv, defaultRulesJson })

  let timer: number | undefined
  const persistNow = async (): Promise<void> => {
    window.clearTimeout(timer)
    await saveBytes(sqlite.export())
  }
  const persist = (): void => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void persistNow(), 300)
  }
  window.addEventListener('pagehide', () => void persistNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persistNow()
  })

  await persistNow() // first boot: store the migrated+seeded database
  return { db, sqlite, persist, persistNow }
}
