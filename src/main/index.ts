import { app, BrowserWindow, shell, session } from 'electron'
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
      preload: join(__dirname, '../preload/index.mjs'),
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
  const policy = is.dev
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: http://localhost:*"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"
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
  initDatabase()

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
