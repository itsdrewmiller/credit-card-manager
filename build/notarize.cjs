// Notarize the macOS app after electron-builder signs it (afterSign hook).
//
// Notarization runs only when credentials are available, in priority order:
//   1. A notarytool keychain profile named in NOTARY_PROFILE (local builds —
//      the app-specific password is stored in the keychain, never in env/CI logs).
//      Create it once with:
//        xcrun notarytool store-credentials "<profile>" \
//          --apple-id you@example.com --team-id ABCDE12345 --password <app-specific-pw>
//   2. APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID env vars (CI).
//
// With neither set (e.g. the ad-hoc-signed fallback build), notarization is
// skipped — submitting an ad-hoc signature would only fail.
const path = require('node:path')

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return

  const profile = process.env.NOTARY_PROFILE
  const hasEnvCreds = !!(
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID
  )
  if (!profile && !hasEnvCreds) {
    console.log('[notarize] no NOTARY_PROFILE or APPLE_* env credentials — skipping')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const { notarize } = require('@electron/notarize')

  console.log(`[notarize] submitting ${appPath} (this can take a few minutes)…`)
  await notarize(
    profile
      ? { tool: 'notarytool', appPath, keychainProfile: profile }
      : {
          tool: 'notarytool',
          appPath,
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID
        }
  )
  console.log('[notarize] done — ticket stapled')
}
