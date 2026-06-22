// Notarize and staple the built DMG (afterAllArtifactBuild hook).
//
// The afterSign hook (build/notarize.cjs) notarizes and staples the .app, which
// makes the app launch cleanly once copied to /Applications. But electron-builder
// then wraps that app in a DMG, and the DMG container is itself unsigned — a
// downloaded, quarantined DMG is rejected by Gatekeeper ("Apple cannot check it
// for malicious software") until the DMG also carries a notarization ticket.
//
// So here we submit the finished DMG to the notary service and staple the ticket
// to it. Runs only when notarization credentials are present (same gate as the
// app hook); otherwise the DMG ships unstapled (dev/ad-hoc builds).
const { execFileSync } = require('node:child_process')

exports.default = async function notarizeDmg(context) {
  const profile = process.env.NOTARY_PROFILE
  const hasEnvCreds = !!(
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID
  )
  if (!profile && !hasEnvCreds) return context.artifactPaths

  const dmgs = (context.artifactPaths || []).filter((p) => p.endsWith('.dmg'))
  for (const dmg of dmgs) {
    const creds = profile
      ? ['--keychain-profile', profile]
      : [
          '--apple-id',
          process.env.APPLE_ID,
          '--password',
          process.env.APPLE_APP_SPECIFIC_PASSWORD,
          '--team-id',
          process.env.APPLE_TEAM_ID
        ]
    console.log(`[notarizeDmg] submitting ${dmg} …`)
    execFileSync('xcrun', ['notarytool', 'submit', dmg, ...creds, '--wait'], { stdio: 'inherit' })
    console.log(`[notarizeDmg] stapling ${dmg}`)
    execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' })
  }
  return context.artifactPaths
}
