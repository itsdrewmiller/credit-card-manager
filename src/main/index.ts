import { app, BrowserWindow, shell, session, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { is } from '@electron-toolkit/utils'
// electron-updater is CJS; the main bundle is ESM, so named imports fail at
// runtime ("Named export 'autoUpdater' not found") — go through the default.
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater
import { sql } from 'drizzle-orm'
import { openDatabase, runMigrations, type DB } from './db'
import { seedIssuers } from './db/issuers'
import { seedPointPrograms } from './db/points'
import { seedExtraProducts } from './db/products'
import { seedCashbackRates, seedBureauReporting, seedReferralValues } from './db/cashback'
import { generateUpcomingBenefits } from './db/generateBenefits'
import { seedDefaultRules } from './db/rules'
import { seedReferralLinks } from './db/referralLinks'
import { getSetting } from './db/settings'
import { refreshOfferFeed, FEED_REFRESHED_KEY } from './trpc/routers/recommendations'
import { dedupeCatalog } from './db/dedupe'
import { productOffer } from './db/schema'
import { importOffersCsv } from './import/offers'
import { appRouter } from './trpc/router'
import { createCallerFactory } from './trpc/trpc'
import type { TrpcRequest } from '../preload'

let db: DB

const createCaller = createCallerFactory(appRouter)

/** Dispatch a renderer tRPC request to the matching procedure on the caller. */
function registerTrpcIpc(): void {
  ipcMain.handle('trpc:request', async (_event, op: TrpcRequest) => {
    const caller = createCaller({ db }) as Record<string, unknown>
    const fn = op.path
      .split('.')
      .reduce<unknown>((obj, key) => (obj as Record<string, unknown>)?.[key], caller)
    if (typeof fn !== 'function') {
      throw new Error(`Unknown procedure: ${op.path}`)
    }
    return (fn as (input: unknown) => Promise<unknown>)(op.input)
  })
}

function resourcePath(rel: string): string {
  // Bundled via electron-builder extraResources in production; project root in dev.
  return app.isPackaged ? join(process.resourcesPath, rel) : join(app.getAppPath(), rel)
}

/** On first run (no offers yet), seed the bundled signup-bonus offers snapshot. */
function seedOffersIfEmpty(): void {
  const count = db.select({ n: sql<number>`count(*)` }).from(productOffer).get()?.n ?? 0
  if (count > 0) return
  const csvPath = resourcePath(join('data', 'signup_bonuses.csv'))
  if (!existsSync(csvPath)) return
  try {
    const res = importOffersCsv(db, readFileSync(csvPath, 'utf8'))
    console.log(`[db] seeded ${res.total} available offers from bundled CSV`)
  } catch (err) {
    console.warn('[db] could not seed offers:', err)
  }
}

function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'cardmanager.db')
  const handle = openDatabase(dbPath)
  db = handle.db
  runMigrations(db, resourcePath('drizzle'))
  const seeded = seedIssuers(db)
  seedPointPrograms(db)
  seedOffersIfEmpty()
  seedExtraProducts(db)
  const cleaned = dedupeCatalog(db)
  if (cleaned.renamed || cleaned.merged) {
    console.log(`[db] catalog cleanup: ${cleaned.renamed} renamed, ${cleaned.merged} merged`)
  }
  const rated = seedCashbackRates(db)
  if (rated) console.log(`[db] filled baseline earn rates for ${rated} products`)
  const flagged = seedBureauReporting(db)
  if (flagged) console.log(`[db] flagged ${flagged} business products as personal-reporting`)
  const referrals = seedReferralValues(db)
  if (referrals) console.log(`[db] filled typical referral values on ${referrals} offers`)
  const seededRules = seedDefaultRules(db, resourcePath(join('data', 'default_rules.json')))
  if (seededRules) console.log(`[db] seeded ${seededRules} default recommendation rules`)
  const seededLinks = seedReferralLinks(db)
  if (seededLinks) console.log(`[db] seeded ${seededLinks} referral links`)
  const gen = generateUpcomingBenefits(db)
  if (gen.created || gen.dated) {
    console.log(`[db] recurring benefits: ${gen.created} generated, ${gen.dated} windows seeded`)
  }
  console.log(`[db] ready at ${dbPath}`, seeded.issuers ? `(seeded ${seeded.issuers} issuers)` : '')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    // Low enough to exercise the phone-width responsive layouts.
    minWidth: 360,
    minHeight: 500,
    show: false,
    title: 'Credit Card Manager',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/**
 * Content-Security-Policy via response headers. Dev needs 'unsafe-inline' /
 * 'unsafe-eval' / ws: for Vite + React Fast Refresh; production is strict. The
 * app loads only local content and talks to the backend over IPC, never HTTP.
 */
function installCsp(): void {
  // Only the dev server (http) gets a CSP header. In production the renderer is
  // loaded from file://, whose opaque origin makes a "script-src 'self'" policy
  // reject the app's own bundled script — a blank-screen trap. The packaged app
  // loads only local content and talks to the backend over IPC, so we don't
  // enforce a header CSP there.
  if (!is.dev) return
  const policy =
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: http://localhost:*"
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

/** Weekly background refresh of the offer feed; failures only log. */
function maybeRefreshOfferFeed(): void {
  const last = getSetting(db, FEED_REFRESHED_KEY)
  const weekMs = 7 * 24 * 3600 * 1000
  if (last && Date.now() - Date.parse(last) < weekMs) return
  refreshOfferFeed(db)
    .then((r) => console.log(`[feed] refreshed offers: ${r.total} rows (${r.created} new) from ${r.url}`))
    .catch((err) => console.warn('[feed]', err instanceof Error ? err.message : err))
}

/**
 * Check GitHub Releases for a newer version, download in the background, and
 * notify when it will install on quit. Packaged builds only.
 *
 * Failure containment: updater activity and errors append to
 * ~/Library/Logs/<app>/updater.log — console.warn is invisible in a packaged
 * app, so without the file a failed update is undiagnosable. The check also
 * re-runs every four hours: a transient failure (offline, rate-limited, quit
 * mid-download) gets retried instead of lost until the next launch, and an
 * app left running across a release still picks it up. Re-checking stops once
 * an update has downloaded; it installs on quit.
 */
function setupAutoUpdate(): void {
  // Mac App Store builds update through the App Store; electron-updater is
  // neither allowed nor functional there.
  if (!app.isPackaged || process.mas) return
  const logFile = join(app.getPath('logs'), 'updater.log')
  const logLine = (level: string, args: unknown[]): void => {
    const text = args.map((a) => (a instanceof Error ? a.stack || a.message : String(a))).join(' ')
    try {
      appendFileSync(logFile, `${new Date().toISOString()} [${level}] ${text}\n`)
    } catch {
      // logging must never take down the updater
    }
  }
  autoUpdater.logger = {
    info: (...args: unknown[]) => logLine('info', args),
    warn: (...args: unknown[]) => logLine('warn', args),
    error: (...args: unknown[]) => logLine('error', args),
    debug: (...args: unknown[]) => logLine('debug', args)
  }
  autoUpdater.on('error', (err) => logLine('error', [err]))

  const check = (): void => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => logLine('error', [err]))
  }
  const recheck = setInterval(check, 4 * 3600 * 1000)
  autoUpdater.on('update-downloaded', (info) => {
    logLine('info', [`update ${info.version} downloaded; installs on quit`])
    clearInterval(recheck)
  })
  check()
}

app.whenReady().then(() => {
  installCsp()

  try {
    initDatabase()
  } catch (err) {
    // Surface a real error instead of silently failing to open a window
    // (e.g. a native-module ABI mismatch).
    dialog.showErrorBox(
      'Credit Card Manager — startup error',
      `The database failed to open.\n\n${err instanceof Error ? err.stack || err.message : String(err)}`
    )
    app.quit()
    return
  }

  registerTrpcIpc()
  createWindow()
  setupAutoUpdate()
  maybeRefreshOfferFeed()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
