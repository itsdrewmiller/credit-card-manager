// electron-builder configuration.
//
// Signing and notarization activate automatically when the relevant credentials
// are present in the environment (set as GitHub Actions secrets — see AGENTS.md).
// Without them, the macOS app falls back to an ad-hoc signature (build/afterPack.cjs)
// so it still opens via the normal Gatekeeper flow instead of being "damaged".

const hasMacCert = !!process.env.CSC_LINK
const canNotarize = !!(
  process.env.APPLE_ID &&
  process.env.APPLE_APP_SPECIFIC_PASSWORD &&
  process.env.APPLE_TEAM_ID
)

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.searchlight.cardmanager',
  productName: 'Credit Card Manager',
  directories: { output: 'release', buildResources: 'build' },
  afterPack: 'build/afterPack.cjs',
  files: ['out/**/*'],
  extraResources: [
    { from: 'drizzle', to: 'drizzle' },
    { from: 'data/signup_bonuses.csv', to: 'data/signup_bonuses.csv' }
  ],
  asarUnpack: ['**/node_modules/better-sqlite3/**', '**/node_modules/pdfjs-dist/**'],
  npmRebuild: true,
  mac: {
    target: 'dmg',
    category: 'public.app-category.finance',
    // With a Developer ID cert present, electron-builder signs normally.
    // Without one, skip its signing (the afterPack hook ad-hoc signs instead).
    identity: hasMacCert ? undefined : null,
    hardenedRuntime: hasMacCert,
    notarize: canNotarize ? { teamId: process.env.APPLE_TEAM_ID } : false
  },
  win: {
    target: 'nsis'
    // Signs automatically when CSC_LINK / CSC_KEY_PASSWORD are in the environment.
  },
  linux: { target: 'AppImage', category: 'Office' }
}
