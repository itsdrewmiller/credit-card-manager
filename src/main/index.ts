import { app, BrowserWindow, shell } from 'electron'
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
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
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
