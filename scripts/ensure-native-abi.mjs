// Keep better-sqlite3's compiled binary matched to whichever runtime is about
// to use it. Node (tests) and Electron (the app) have different native ABIs
// but share one build output, so switching between `npm test` and
// `npm run dev` used to require a manual rebuild — the pretest/predev hooks
// call this instead. Probes first, so it's a no-op when the ABI already
// matches.
//
// Usage: node scripts/ensure-native-abi.mjs <node|electron>
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const target = process.argv[2]
if (target !== 'node' && target !== 'electron') {
  console.error('usage: ensure-native-abi.mjs <node|electron>')
  process.exit(2)
}

const require = createRequire(import.meta.url)
// Constructing a Database is what actually dlopens the native binding —
// require() alone defers it and would pass on a mismatched ABI.
const probeSrc = "new (require('better-sqlite3'))(':memory:'); process.exit(0)"

function probe() {
  if (target === 'node') {
    return spawnSync(process.execPath, ['-e', probeSrc], { stdio: 'ignore' })
  }
  // ELECTRON_RUN_AS_NODE runs the Electron binary as plain Node — but with
  // Electron's embedded Node build, i.e. the ABI the app will actually use.
  const electron = require('electron') // resolves to the binary path
  return spawnSync(electron, ['-e', probeSrc], {
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
}

if (probe().status === 0) process.exit(0)

console.log(`[abi] better-sqlite3 not built for ${target} — rebuilding…`)
const rebuild =
  target === 'node'
    ? spawnSync('npm', ['rebuild', 'better-sqlite3'], { stdio: 'inherit', shell: true })
    : spawnSync('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3'], {
        stdio: 'inherit',
        shell: true
      })
process.exit(rebuild.status ?? 1)
