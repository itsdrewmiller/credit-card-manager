import { resolve } from 'node:path'
import { readFileSync, renameSync, existsSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Capacitor expects webDir/index.html; the dev entry is index.web.html. */
function renameEntry(): Plugin {
  return {
    name: 'rename-web-entry',
    closeBundle() {
      const from = resolve('out/web/index.web.html')
      if (existsSync(from)) renameSync(from, resolve('out/web/index.html'))
    }
  }
}

const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

/**
 * Browser build (the mobile-port path): the renderer plus an in-process
 * backend (src/web) on sql.js. `npm run dev:web` serves it; `build:web`
 * emits static files for the Capacitor shell.
 */
export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  plugins: [react(), renameEntry()],
  build: {
    outDir: 'out/web',
    rollupOptions: { input: resolve('index.web.html') }
  },
  server: { port: 5177 }
})
