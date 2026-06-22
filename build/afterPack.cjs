// Ad-hoc code-sign the macOS app.
//
// We have no Apple Developer ID, so electron-builder skips signing
// (mac.identity: null). But electron-builder modifies the Electron app while
// packaging, which invalidates the app's original signature — and on Apple
// Silicon an app with a missing/invalid signature plus the download quarantine
// flag is rejected as "damaged" (the wording that tells users to trash it).
//
// Ad-hoc signing ("--sign -") produces a *valid* (un-notarized) signature with
// no certificate/keychain required, so Gatekeeper falls back to the normal
// "unidentified developer" path (right-click → Open / System Settings → Open
// Anyway) instead of "damaged".
const { execFileSync } = require('node:child_process')
const path = require('node:path')

/** True if a Developer ID Application identity is in the local keychain. */
function hasLocalDeveloperId() {
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8'
    })
    return /Developer ID Application/.test(out)
  } catch {
    return false
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  // A real Developer ID cert is configured (CI via CSC_LINK, or a local keychain
  // identity) — electron-builder will sign (and notarize) properly, so don't
  // ad-hoc sign over it.
  if (process.env.CSC_LINK || hasLocalDeveloperId()) return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  console.log(`[afterPack] ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })
}
