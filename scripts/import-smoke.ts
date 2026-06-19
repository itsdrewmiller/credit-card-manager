/**
 * Headless importer test against the real Equifax sample PDF.
 * Run: npm run import:smoke   (requires "Equifax Report.pdf" in repo root)
 */
import { readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { sql, eq } from 'drizzle-orm'
import { extractTextItems } from '../src/main/import/pdf'
import { parseEquifaxAccounts } from '../src/main/import/equifax'
import { buildIssuerMatcher, type AliasRow } from '../src/main/import/match'
import { openDatabase, runMigrations } from '../src/main/db/index'
import { seedIssuers } from '../src/main/db/issuers'
import { issuer, issuerAlias, card } from '../src/main/db/schema'
import { appRouter } from '../src/main/trpc/router'

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`✓ ${msg}`)
}

const PDF = 'Equifax Report.pdf'
if (!existsSync(PDF)) {
  console.log(`(skip) ${PDF} not present`)
  process.exit(0)
}

const dir = mkdtempSync(join(tmpdir(), 'ccm-import-'))
try {
  const items = await extractTextItems(new Uint8Array(readFileSync(PDF)))
  const tradelines = parseEquifaxAccounts(items)
  console.log(`• parsed ${tradelines.length} tradelines`)
  assert(tradelines.length >= 15, `parsed a realistic number of tradelines (${tradelines.length})`)

  // Creditor names are real (not page-header noise).
  assert(
    tradelines.every(
      (t) =>
        t.creditorName.length > 2 &&
        !/Page \d|Confirmation/.test(t.creditorName) &&
        !/-\s*(Closed|Paid)\s*$/i.test(t.creditorName)
    ),
    'creditor names are real and free of the "- Closed" suffix'
  )
  console.log('  e.g.', tradelines.slice(0, 4).map((t) => t.creditorName).join(', '))

  // Opened dates parse to ISO where present.
  const withDates = tradelines.filter((t) => t.openedDate)
  assert(
    withDates.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.openedDate!)),
    `opened dates normalized to ISO (${withDates.length} have dates)`
  )

  // Last 4 captured (the Equifax advantage).
  const withLast4 = tradelines.filter((t) => t.last4)
  assert(
    withLast4.length > 0 && withLast4.every((t) => /^\d{2,4}$/.test(t.last4!)),
    `last-4 captured from the report (${withLast4.length} tradelines)`
  )

  // Credit cards detected, responsibility normalized.
  const cards = tradelines.filter((t) => t.isCreditCard)
  console.log(`• ${cards.length} look like credit cards`)
  assert(cards.length > 0, 'detected credit-card tradelines')

  // Closed accounts carry a closed date where the report shows one.
  const closed = tradelines.filter((t) => t.status === 'closed')
  const closedWithDate = closed.filter((t) => t.closedDate)
  console.log(`• ${closed.length} closed accounts, ${closedWithDate.length} with a closed date`)
  assert(
    closedWithDate.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.closedDate!)),
    'closed dates normalized to ISO'
  )

  // Build matcher from the seeded catalog.
  const { db } = openDatabase(join(dir, 'test.db'))
  runMigrations(db, join(process.cwd(), 'drizzle'))
  seedIssuers(db)
  const corpus: AliasRow[] = db
    .select({ issuerId: issuer.id, issuerName: issuer.name, aliasText: issuerAlias.aliasText })
    .from(issuerAlias)
    .innerJoin(issuer, eq(issuerAlias.issuerId, issuer.id))
    .all()
  const matcher = buildIssuerMatcher(corpus)

  const matchedCount = tradelines.filter((t) => matcher.match(t.creditorName)).length
  console.log(`• ${matchedCount}/${tradelines.length} tradelines matched an issuer`)
  assert(matchedCount > 0, 'at least some tradelines matched a catalog issuer')

  // Commit path: every tradeline becomes a card (stub if unmatched), with last4.
  db.transaction((tx) => {
    for (const t of tradelines) {
      tx.insert(card)
        .values({
          rawCreditorName: t.creditorName,
          rawAccountLabel: t.accountType,
          last4: t.last4,
          status: t.status,
          openedDate: t.openedDate,
          closedDate: t.closedDate,
          source: 'imported'
        })
        .run()
    }
  })
  const n = db.select({ n: sql<number>`count(*)` }).from(card).get()?.n ?? 0
  assert(n === tradelines.length, `commit created a card for every tradeline (${n})`)
  const withStoredLast4 = db.select({ n: sql<number>`count(*)` }).from(card).where(sql`last4 is not null`).get()?.n ?? 0
  assert(withStoredLast4 > 0, `cards stored with last-4 (${withStoredLast4})`)

  // --- Full router path: parse -> commit -> read (closedDate, issuerId, dedup) ---
  const { db: db2 } = openDatabase(join(dir, 'router.db'))
  runMigrations(db2, join(process.cwd(), 'drizzle'))
  seedIssuers(db2)
  const caller = appRouter.createCaller({ db: db2 })
  const b64 = readFileSync(PDF).toString('base64')

  const preview = await caller.importer.parseEquifax({ base64: b64 })
  assert(preview.duplicates === 0, 'first import flags no duplicates')

  const rows = preview.tradelines
    .filter((t) => t.isCreditCard && !t.duplicate)
    .map((t) => ({
      creditorName: t.creditorName,
      accountType: t.accountType,
      last4: t.last4,
      issuerId: t.suggestedIssuerId,
      openedDate: t.openedDate,
      closedDate: t.closedDate,
      status: t.status
    }))
  const res = await caller.importer.commit({ ownerPersonId: null, rows })
  assert(res.created === rows.length, `committed ${res.created} cards via the router`)

  const stored = await caller.cards.list()
  const closedStored = stored.filter((c) => c.status === 'closed' && c.closedDate)
  console.log(`• stored ${closedStored.length} closed cards with a closed date`)
  assert(closedStored.length > 0, 'closed cards are stored WITH their closed date')
  assert(
    stored.filter((c) => c.issuerId != null).length > 0,
    'cards are stored with their bank (issuerId)'
  )

  // Re-importing the same report should flag every committed card as a duplicate.
  const preview2 = await caller.importer.parseEquifax({ base64: b64 })
  const dupCreditCards = preview2.tradelines.filter((t) => t.isCreditCard && t.duplicate).length
  assert(
    dupCreditCards === rows.length,
    `re-import flags all ${rows.length} committed cards as duplicates (got ${dupCreditCards})`
  )

  console.log('\n✅ Importer smoke checks passed.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
