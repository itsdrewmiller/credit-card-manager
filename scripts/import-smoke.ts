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
import { seedCatalog } from '../src/main/db/seed'
import { cardProduct, cardProductAlias, issuer, card } from '../src/main/db/schema'

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
  assert(
    tradelines.every((t) => t.responsibility === 'individual' || t.responsibility === 'authorized_user'),
    'responsibility normalized to enum'
  )

  // Build matcher from the seeded catalog.
  const { db } = openDatabase(join(dir, 'test.db'))
  runMigrations(db, join(process.cwd(), 'drizzle'))
  seedCatalog(db)
  const corpus: AliasRow[] = db
    .select({ issuerId: issuer.id, issuerName: issuer.name, aliasText: cardProductAlias.aliasText })
    .from(cardProductAlias)
    .innerJoin(cardProduct, eq(cardProductAlias.cardProductId, cardProduct.id))
    .innerJoin(issuer, eq(cardProduct.issuerId, issuer.id))
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
          responsibility: t.responsibility,
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

  console.log('\n✅ Importer smoke checks passed.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
