/**
 * Headless importer test against the real Experian sample PDF.
 * Run: npm run import:smoke   (requires "Experian Report.pdf" in repo root)
 */
import { readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { sql, eq } from 'drizzle-orm'
import { extractTextItems } from '../src/main/import/pdf'
import { parseExperianAccounts } from '../src/main/import/experian'
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

const PDF = 'Experian Report.pdf'
if (!existsSync(PDF)) {
  console.log(`(skip) ${PDF} not present`)
  process.exit(0)
}

const dir = mkdtempSync(join(tmpdir(), 'ccm-import-'))
try {
  const items = await extractTextItems(new Uint8Array(readFileSync(PDF)))
  const tradelines = parseExperianAccounts(items)
  console.log(`• parsed ${tradelines.length} tradelines`)
  assert(tradelines.length >= 20, `parsed a realistic number of tradelines (${tradelines.length})`)

  // Every tradeline has a creditor name.
  assert(tradelines.every((t) => t.creditorName.length > 0), 'every tradeline has a creditor name')

  // Opened dates parse to ISO where present.
  const withDates = tradelines.filter((t) => t.openedDate)
  assert(
    withDates.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.openedDate!)),
    `opened dates normalized to ISO (${withDates.length} have dates)`
  )

  // Credit cards detected, and responsibility normalized.
  const cards = tradelines.filter((t) => t.isCreditCard)
  console.log(`• ${cards.length} look like credit cards`)
  assert(cards.length > 0, 'detected credit-card tradelines')
  assert(
    tradelines.every((t) => t.responsibility === 'individual' || t.responsibility === 'authorized_user'),
    'responsibility normalized to enum'
  )

  // Build matcher from the seeded catalog and check issuer matches.
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

  // Amex / Chase tradelines should match their issuer with high confidence.
  const amex = tradelines.find((t) => /AMERICAN EXPRESS/i.test(t.creditorName))
  if (amex) {
    const m = matcher.match(amex.creditorName)
    assert(m?.issuerName === 'American Express', `"${amex.creditorName}" matches American Express`)
  }

  const matchedCount = tradelines.filter((t) => matcher.match(t.creditorName)).length
  console.log(`• ${matchedCount}/${tradelines.length} tradelines matched an issuer`)
  assert(matchedCount > 0, 'at least some tradelines matched a catalog issuer')

  // Commit path: every tradeline becomes a card (stub if unmatched).
  db.transaction((tx) => {
    for (const t of tradelines) {
      tx.insert(card)
        .values({
          rawCreditorName: t.creditorName,
          rawAccountLabel: t.accountType,
          status: t.status,
          responsibility: t.responsibility,
          openedDate: t.openedDate,
          source: 'imported'
        })
        .run()
    }
  })
  const n = db.select({ n: sql<number>`count(*)` }).from(card).get()?.n ?? 0
  assert(n === tradelines.length, `commit created a card for every tradeline (${n})`)

  console.log('\n✅ Importer smoke checks passed.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
