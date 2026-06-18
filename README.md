# Credit Card Manager

A local-first desktop app for credit-card churning — see [FEATURE_MAP.md](./FEATURE_MAP.md).

Electron + React + TypeScript, SQLite via `better-sqlite3`, Drizzle ORM, tRPC-over-IPC, Mantine.

## Develop

```bash
npm install
npm run rebuild   # rebuild better-sqlite3 against Electron's ABI (needed before `dev`)
npm run dev       # launch the app with hot reload
```

> **Why `npm run rebuild`?** `better-sqlite3` is a native module. `npm install` builds it for
> your system Node, but Electron uses a different ABI. Run `npm run rebuild` once after install
> (and after any Electron version bump) so the app can open the database.
>
> **The ABI dance:** the headless tests (`db:smoke`, `import:smoke`) run under **Node**, while the
> app and packaging run under **Electron**. These need different builds of `better-sqlite3`:
> - Before running the app / `npm run dist`: `npm run rebuild` (Electron ABI).
> - Before running the smoke tests: `npm rebuild better-sqlite3` (Node ABI).
> `npm run pack`/`dist` rebuild for Electron automatically, so re-run `npm rebuild better-sqlite3`
> afterward if you want to run the Node tests again.

The SQLite database is created at `<userData>/cardmanager.db` on first launch (e.g.
`~/Library/Application Support/Credit Card Manager/` on macOS). Migrations run and the card-product
catalog seeds automatically.

## Common scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app (hot reload) |
| `npm run build` | Type-bundle all three processes into `out/` |
| `npm run typecheck` | Type-check main + renderer |
| `npm run db:generate` | Regenerate SQL migrations from `src/main/db/schema.ts` |
| `npm run db:smoke` | Headless data-layer test (no Electron) — migrations, seed, FKs, bonus/velocity/benefit/backup logic |
| `npm run import:smoke` | Headless importer test against a local `Experian Report.pdf` |
| `npm run pack` | Build an unpacked app into `release/` (no installer) |
| `npm run dist` | Build installers (DMG/NSIS/AppImage) via electron-builder into `release/` |

> Packaging rebuilds `better-sqlite3` for Electron automatically and ships the `drizzle/` migrations
> as app resources. macOS builds are unsigned (`mac.identity: null`); to distribute without
> "unidentified developer" warnings you'll need an Apple Developer ID + notarization.

> After changing `src/main/db/schema.ts`, run `npm run db:generate` to create a new migration.
> `npm run db:smoke` runs under plain Node, so run it **before** `npm run rebuild` (or
> `npm install` again) since it needs the Node-ABI build of `better-sqlite3`.

## Data files

The credit report PDFs and the legacy spreadsheet are **gitignored** and never committed.
Drop Experian report samples in the repo root for the importer (Phase 5) to work against.

## Project layout

```
src/
  main/            Electron main process
    db/            Drizzle schema, migrations runner, seed catalog
    trpc/          tRPC routers (the typed API the UI calls)
    index.ts       App entry: window, DB init, IPC handler
  preload/         Exposes the tRPC bridge to the renderer
  renderer/        React app (Mantine UI, pages, tRPC client)
drizzle/           Generated SQL migrations
scripts/           db-smoke.ts and other dev utilities
```
