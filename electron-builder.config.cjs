// electron-builder configuration.
//
// Signing and notarization activate automatically when the relevant credentials
// are present:
//   - CI: a Developer ID .p12 in CSC_LINK (set as a GitHub Actions secret — see
//     AGENTS.md).
//   - Local: a "Developer ID Application" certificate installed in the login
//     keychain (detected below) — no env var needed.
// Without either, the macOS app falls back to an ad-hoc signature
// (build/afterPack.cjs) so it still opens via the normal Gatekeeper flow instead
// of being reported as "damaged".

const { execFileSync } = require('node:child_process')

/** True if a Developer ID Application identity is in the local keychain. */
function hasLocalDeveloperId() {
  if (process.platform !== 'darwin') return false
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8'
    })
    return /Developer ID Application/.test(out)
  } catch {
    return false
  }
}

const hasMacCert = !!process.env.CSC_LINK || hasLocalDeveloperId()

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.searchlight.cardmanager',
  productName: 'Credit Card Manager',
  directories: { output: 'release', buildResources: 'build' },
  afterPack: 'build/afterPack.cjs',
  // Notarization is handled in these hooks (keychain-profile or env credentials),
  // not electron-builder's built-in notarize, so mac.notarize stays false below.
  // afterSign notarizes/staples the .app; afterAllArtifactBuild does the DMG.
  afterSign: 'build/notarize.cjs',
  afterAllArtifactBuild: 'build/notarizeDmg.cjs',
  files: [
    'out/**/*',
    // ——— packaging diet (see AGENTS.md) ———
    // pdfjs's optional canvas backend rasterizes pages; we only extract text
    // (verified: tests/integration/import.test.ts passes without it).
    '!**/node_modules/@napi-rs/**',
    // Only legacy/build/pdf.mjs + pdf.worker.mjs are imported (src/main/import/pdf.ts);
    // keep cmaps + standard_fonts, drop the viewer, decoders, and duplicate builds.
    '!**/node_modules/pdfjs-dist/{build,web,image_decoders,types}/**',
    '!**/node_modules/pdfjs-dist/legacy/build/*.map',
    '!**/node_modules/pdfjs-dist/legacy/build/*.min.mjs',
    '!**/node_modules/pdfjs-dist/legacy/build/pdf.sandbox.*',
    // Ship the compiled binary + JS lib, not sources and gyp intermediates.
    '!**/node_modules/better-sqlite3/{deps,src,bin}/**',
    '!**/node_modules/better-sqlite3/build/Release/{obj,obj.target}/**',
    '!**/node_modules/better-sqlite3/build/Release/{sqlite3.a,test_extension.node}',
    '!**/node_modules/better-sqlite3/build/{Makefile,config.gypi,*.mk,gyp-mac-tool}'
  ],
  // Strip the ~54 unused Chromium locale packs.
  electronLanguages: ['en'],
  // Update feed for electron-updater (bakes app-update.yml into the build).
  // Release assets are still published by the GitHub Actions release job, so
  // CI builds keep --publish never.
  publish: { provider: 'github', owner: 'itsdrewmiller', repo: 'credit-card-manager' },
  // No spaces: GitHub rewrites spaces in release-asset names (to dots), which
  // would break the URLs electron-updater reads from latest*.yml.
  artifactName: '${name}-${version}-${arch}.${ext}',
  extraResources: [
    { from: 'drizzle', to: 'drizzle' },
    { from: 'data/signup_bonuses.csv', to: 'data/signup_bonuses.csv' },
    { from: 'data/default_rules.json', to: 'data/default_rules.json' }
  ],
  asarUnpack: ['**/node_modules/better-sqlite3/**', '**/node_modules/pdfjs-dist/**'],
  npmRebuild: true,
  mac: {
    // zip is what electron-updater downloads on macOS; the dmg is for humans.
    target: ['dmg', 'zip'],
    category: 'public.app-category.finance',
    // With a Developer ID cert present, electron-builder signs normally.
    // Without one, skip its signing (the afterPack hook ad-hoc signs instead).
    identity: hasMacCert ? undefined : null,
    hardenedRuntime: hasMacCert,
    notarize: false // handled by the afterSign hook (build/notarize.cjs)
  },
  win: {
    target: 'nsis'
    // Signs automatically when CSC_LINK / CSC_KEY_PASSWORD are in the environment.
  },
  linux: { target: 'AppImage', category: 'Office' }
}
