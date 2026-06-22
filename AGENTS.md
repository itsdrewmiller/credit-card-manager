# AGENTS.md — development guide

Engineering notes for working on Credit Card Manager. For the product overview
see [README.md](./README.md); for the roadmap see [FEATURE_MAP.md](./FEATURE_MAP.md).

## Stack

Electron + React + TypeScript. SQLite via `better-sqlite3`, Drizzle ORM +
migrations, typed **tRPC over IPC** between the main and renderer processes,
Mantine + TanStack Table for UI, `pdfjs-dist` for report parsing, Fuse.js for
fuzzy matching, electron-builder for installers. Bundled with electron-vite
(separate main / preload / renderer builds).

## Getting started

```bash
npm install
npm run rebuild   # rebuild better-sqlite3 against Electron's ABI (needed before `dev`)
npm run dev       # launch the app with hot reload
```

The SQLite database is created at `<userData>/cardmanager.db` on first launch
(e.g. `~/Library/Application Support/Credit Card Manager/` on macOS). Migrations
run and the card-product catalog seeds automatically.

## The better-sqlite3 ABI dance

`better-sqlite3` is a native module, and Node and Electron use different ABIs.
`npm install` builds it for your system Node; the app needs the Electron build.

- Before running the app / `npm run pack` / `npm run dist`: `npm run rebuild` (Electron ABI).
- Before running the headless tests (`db:smoke`, `import:smoke`): `npm rebuild better-sqlite3` (Node ABI).

`npm run pack`/`dist` rebuild for Electron automatically, so re-run
`npm rebuild better-sqlite3` afterward if you want to run the Node tests again.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app (hot reload) |
| `npm run build` | Type-bundle all three processes into `out/` |
| `npm run typecheck` | Type-check main + renderer |
| `npm run db:generate` | Regenerate SQL migrations from `src/main/db/schema.ts` |
| `npm run db:smoke` | Headless data-layer test (no Electron) — migrations, seed, FKs, bonus/velocity/benefit/backup logic |
| `npm run import:smoke` | Headless importer test against a local `Equifax Report.pdf` |
| `npm run rebuild` | Rebuild `better-sqlite3` for Electron |
| `npm run pack` | Build an unpacked app into `release/` (no installer) |
| `npm run dist` | Build installers (DMG/NSIS/AppImage) via electron-builder into `release/` |

## Project layout

```
src/
  main/            Electron main process
    db/            Drizzle schema, migrations runner, seed catalog
    domain/        Pure churning logic (bonus value, 5/24, benefit status…)
    import/        Equifax PDF extraction, parser, fuzzy matcher
    trpc/          tRPC routers (the typed API the UI calls)
    index.ts       App entry: window, DB init, IPC handler
  preload/         Exposes the tRPC bridge to the renderer
  renderer/        React app (Mantine UI, pages, tRPC client, shared types)
  shared/          Constants + formatting helpers used by both processes
drizzle/           Generated SQL migrations (shipped as app resources)
scripts/           db-smoke.ts, import-smoke.ts and other dev utilities
```

## Conventions

- **Money** is stored as integer **cents**; **point valuation** is REAL
  cents-per-point; **dates** are ISO `YYYY-MM-DD` text; **timestamps** are epoch
  millis. Keeping payloads JSON-safe is why there's no tRPC transformer.
- **Cards are mostly-nullable stubs** — a card can exist with almost nothing
  filled in. Completeness is **derived** at query time (`src/main/domain/needsInfo.ts`),
  not stored, and powers the Needs-info inbox.
- **Pure domain logic lives in `src/main/domain/`** so it can be unit-tested
  headlessly without Electron. Add assertions to `scripts/db-smoke.ts`.
- Renderer types come from the router via `inferRouterOutputs` in
  `src/renderer/src/lib/types.ts` — don't hand-write row shapes.
- After changing `src/main/db/schema.ts`, run `npm run db:generate` to create a
  new migration.

## Database & migrations

Drizzle relational queries on the better-sqlite3 (sync) driver must be executed
with `.sync()` (e.g. `db.query.card.findMany({...}).sync()`); single-row inserts
use `.returning().get()`. Migrations are generated into `drizzle/` and applied
on startup; in the packaged app they're shipped via `extraResources` and read
from `process.resourcesPath/drizzle`.

## Credit-report importer

Targets **Equifax** PDFs. Pipeline: `src/main/import/pdf.ts` (text extraction) →
`equifax.ts` (label/value parser) → `match.ts` (Fuse.js issuer match). Each
account is a run of `Label:` / value pairs anchored by `Date Reported:`; the
creditor name is the non-noise line just above the address. Creditor names are
issuer-level, so matching resolves the **issuer** and leaves the exact product
for the user. Equifax exposes the **last 4** of the account number (e.g.
`*6720`), which we keep. Validate changes with `npm run import:smoke` against a
local `Equifax Report.pdf`.

## Packaging

electron-builder config lives in the `build` field of `package.json`. It rebuilds
`better-sqlite3` for Electron, unpacks the native binary via `asarUnpack`, and
ships `drizzle/` as `extraResources`. macOS builds are unsigned (`mac.identity: null`);
distributing without "unidentified developer" warnings needs an Apple Developer
ID + notarization.

## Releases (CI)

`.github/workflows/release.yml` builds and publishes installers via GitHub
Releases — **not** committed binaries (which would bloat git history). Compiled
apps don't belong in the repo tree; the Releases tab is the durable home.

How it works:
- A **build matrix** on `macos-latest` (`.dmg`) and `windows-latest` (`.exe`)
  runs `npm run build` + `npx electron-builder --publish never` and uploads each
  installer as a workflow artifact.
- A separate **release** job downloads both artifacts and publishes a single
  GitHub Release via `softprops/action-gh-release` (one writer avoids a
  two-runner race on the same release).

Cut a release:
```bash
# bump the version in package.json first if needed, then:
git tag v0.1.0
git push origin v0.1.0
```
The tag push triggers the workflow; the Release appears with both installers
attached and auto-generated notes. `workflow_dispatch` (the "Run workflow"
button) builds artifacts for testing without publishing.

macOS runners are Apple Silicon, so the `.dmg` is **arm64 only**. Add an Intel or
universal build (`--mac --universal`, or an x64 matrix entry) if anyone on an
Intel Mac needs it. The release itself uses the default `GITHUB_TOKEN`
(`permissions: contents: write`) — no extra secrets required for publishing.

## Code signing

Signing config lives in `electron-builder.config.cjs` and activates automatically
once credentials are present — no code changes needed. macOS signing turns on when
either a `.p12` is in `CSC_LINK` (CI) **or** a *Developer ID Application* cert is in
the local keychain (detected by `security find-identity`). Notarization is handled
by two hooks — `build/notarize.cjs` (afterSign → the `.app`) and
`build/notarizeDmg.cjs` (afterAllArtifactBuild → the `.dmg`) — and runs when a
`NOTARY_PROFILE` or the `APPLE_*` env vars are set. Without any of this, macOS falls
back to an ad-hoc signature (`build/afterPack.cjs`) so builds aren't "damaged";
Windows builds are unsigned (SmartScreen will warn).

Both the app **and** the DMG get their own notarization ticket stapled — the app so
it launches offline once copied to /Applications, the DMG so the downloaded
container clears Gatekeeper at mount time.

**macOS — build signed + notarized locally** (needs an Apple Developer Program
membership, ~$99/yr):
1. In Xcode → Settings → Accounts → Manage Certificates → **+ → Developer ID
   Application**. This installs the cert + private key into the login keychain.
2. Create an **app-specific password** at appleid.apple.com.
3. Store notary credentials once (password goes into the keychain, not the shell):
   ```
   xcrun notarytool store-credentials "ccm-notary" \
     --apple-id you@example.com --team-id ABCDE12345 --password xxxx-xxxx-xxxx-xxxx
   ```
4. Build: `NOTARY_PROFILE=ccm-notary npx electron-builder --config electron-builder.config.cjs --mac dmg`
   The cert is auto-detected (signs + hardened runtime); the hooks notarize/staple
   the app and dmg. First notarization on a new account can take 30–60 min; later
   ones are usually a few minutes. Verify with `spctl -a -t exec "<app>"` (app) and
   `gktool scan "<dmg>"` (dmg). `gktool` is authoritative for notarized DMGs;
   `spctl -t open` reports "no usable signature" on an unsigned-but-notarized DMG,
   which is expected and fine.

**macOS — in CI** (GitHub Actions): export the cert as a `.p12` and add repo
**Settings → Secrets and variables → Actions**:
   - `MAC_CSC_LINK` — base64 of the `.p12` (`base64 -i cert.p12 | pbcopy`)
   - `MAC_CSC_KEY_PASSWORD` — the `.p12` password
   - `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`
   The hooks use the `APPLE_*` vars (no keychain profile) when `NOTARY_PROFILE` is
   unset. (Electron's default entitlements cover the app; add a custom entitlements
   plist only if notarization complains.)

**Windows — code-signing certificate** (~$100–400/yr from a CA). Standard (OV)
certs now require a hardware token, which doesn't suit CI; the CI-friendly routes
are cloud signing (**Azure Trusted Signing**, **SSL.com eSigner**). For a simple
file-based cert:
   - `WIN_CSC_LINK` — base64 of the `.pfx`
   - `WIN_CSC_KEY_PASSWORD` — the `.pfx` password
   EV certs clear SmartScreen immediately; OV builds reputation over downloads.

The workflow already wires these secret names into the macOS/Windows package
steps — set them and the next tagged release is signed.

## Data files (never commit)

The credit-report PDFs and the legacy spreadsheet are **gitignored**. Drop
Equifax report samples in the repo root for the importer to work against — they
stay local.
