import { app, BrowserWindow, shell, session, dialog } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { createIPCHandler } from 'electron-trpc/main'
import { openDatabase, runMigrations, type DB } from './db'
import { seedCatalog } from './db/seed'
import { appRouter } from './trpc/router'

let db: DB

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

  const win = createWindow()
  createIPCHandler({ router: appRouter, windows: [win], createContext: async () => ({ db }) })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow()
      createIPCHandler({ router: appRouter, windows: [w], createContext: async () => ({ db }) })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
