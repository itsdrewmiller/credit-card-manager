import type { CapacitorConfig } from '@capacitor/cli'

/**
 * iOS shell around the browser build (npm run build:web → out/web). The web
 * layer is fully self-contained — sql.js backend, IndexedDB persistence — so
 * the shell needs no plugins yet. Future: swap IndexedDB for filesystem
 * persistence and add the paid sync feature behind the same seam.
 */
const config: CapacitorConfig = {
  appId: 'dev.searchlight.cardmanager',
  appName: 'Credit Card Manager',
  webDir: 'out/web',
  ios: {
    contentInset: 'automatic'
  }
}

export default config
