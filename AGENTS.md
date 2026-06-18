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
| `npm run import:smoke` | Headless importer test against a local `Experian Report.pdf` |
| `npm run rebuild` | Rebuild `better-sqlite3` for Electron |
| `npm run pack` | Build an unpacked app into `release/` (no installer) |
| `npm run dist` | Build installers (DMG/NSIS/AppImage) via electron-builder into `release/` |

## Project layout

```
src/
  main/            Electron main process
    db/            Drizzle schema, migrations runner, seed catalog
    domain/        Pure churning logic (bonus value, 5/24, benefit status…)
    import/        Experian PDF extraction, parser, fuzzy matcher
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

Targets **Experian** PDFs (the cleanest export; Equifax/TransUnion samples are
website prints with broken pagination). Pipeline:
`src/main/import/pdf.ts` (text extraction) → `experian.ts` (label/value parser)
→ `match.ts` (Fuse.js issuer match). Report names are issuer-level, so matching
resolves the **issuer**; the exact product is left for the user. Account numbers
are masked, so **last-4 is never available** from the report. Validate changes
with `npm run import:smoke` against a local `Experian Report.pdf`.

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

Signing config lives in `electron-builder.config.cjs` and is **driven entirely by
environment variables**, so it activates automatically once the secrets are set —
no code changes needed. Until then, macOS builds fall back to an ad-hoc signature
(`build/afterPack.cjs`) so they aren't reported as "damaged"; Windows builds are
unsigned (SmartScreen will warn).

**macOS — Developer ID + notarization** (needs an Apple Developer Program
membership, ~$99/yr). Notarization is what removes *all* Gatekeeper warnings.
1. Create a **Developer ID Application** certificate; export it as a `.p12` with a password.
2. Create an **app-specific password** at appleid.apple.com (for notarytool).
3. Add repo **Settings → Secrets and variables → Actions**:
   - `MAC_CSC_LINK` — base64 of the `.p12` (`base64 -i cert.p12 | pbcopy`)
   - `MAC_CSC_KEY_PASSWORD` — the `.p12` password
   - `APPLE_ID` — your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD` — the app-specific password
   - `APPLE_TEAM_ID` — your 10-char Team ID
   The config enables signing when `CSC_LINK` is present and notarization when the
   three `APPLE_*` values are present. (Electron's default entitlements cover the
   app; add a custom entitlements plist only if notarization complains.)

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
Experian report samples in the repo root for the importer to work against — they
stay local.
