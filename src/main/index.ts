import { app, BrowserWindow, shell, session, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { openDatabase, runMigrations, type DB } from './db'
import { seedCatalog } from './db/seed'
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

function migrationsFolder(): string {
  // Bundled via electron-builder extraResources in production; project root in dev.
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}

function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'cardmanager.db')
  const handle = openDatabase(dbPath)
  db = handle.db
  runMigrations(db, migrationsFolder())
  const seeded = seedCatalog(db)
  console.log(`[db] ready at ${dbPath}`, seeded.issuers ? `(seeded ${seeded.products} products)` : '')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
