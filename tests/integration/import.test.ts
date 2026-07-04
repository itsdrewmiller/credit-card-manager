/**
 * Importer integration tests against the real Equifax sample PDF.
 * The PDF holds personal data and is local-only (gitignored), so the whole
 * suite skips when it's absent — e.g. in CI.
 */
import { readFileSync, existsSync } from 'node:fs'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, eq } from 'drizzle-orm'
import { makeTestDb, type TestDb } from '../helpers/db'
import { extractTextItems } from '../../src/main/import/pdf'
import { parseEquifaxAccounts, type ParsedTradeline } from '../../src/main/import/equifax'
import { buildIssuerMatcher, type AliasRow } from '../../src/main/import/match'
import { seedIssuers } from '../../src/main/db/issuers'
import { issuer, issuerAlias, card } from '../../src/main/db/schema'
import { appRouter } from '../../src/main/trpc/router'

const PDF = 'Equifax Report.pdf'

describe.skipIf(!existsSync(PDF))('Equifax PDF import', () => {
  let tradelines: ParsedTradeline[]
  let t: TestDb
  let routerT: TestDb

  beforeAll(async () => {
    tradelines = parseEquifaxAccounts(await extractTextItems(new Uint8Array(readFileSync(PDF))))
    t = makeTestDb()
    routerT = makeTestDb()
    seedIssuers(t.db)
    seedIssuers(routerT.db)
  })
  afterAll(() => {
    t?.cleanup()
    routerT?.cleanup()
  })

  it('parses a realistic set of clean tradelines', () => {
    expect(tradelines.length).toBeGreaterThanOrEqual(15)
    for (const tl of tradelines) {
      expect(tl.creditorName.length).toBeGreaterThan(2)
      expect(tl.creditorName).not.toMatch(/Page \d|Confirmation/)
      expect(tl.creditorName).not.toMatch(/-\s*(Closed|Paid)\s*$/i)
    }
  })

  it('normalizes dates to ISO and captures last-4', () => {
    const withDates = tradelines.filter((tl) => tl.openedDate)
    expect(withDates.every((tl) => /^\d{4}-\d{2}-\d{2}$/.test(tl.openedDate!))).toBe(true)

    const withLast4 = tradelines.filter((tl) => tl.last4)
    expect(withLast4.length).toBeGreaterThan(0)
    expect(withLast4.every((tl) => /^\d{2,4}$/.test(tl.last4!))).toBe(true)

    const closedWithDate = tradelines.filter((tl) => tl.status === 'closed' && tl.closedDate)
    expect(closedWithDate.every((tl) => /^\d{4}-\d{2}-\d{2}$/.test(tl.closedDate!))).toBe(true)
  })

  it('detects credit cards and matches issuers from the seeded catalog', () => {
    expect(tradelines.filter((tl) => tl.isCreditCard).length).toBeGreaterThan(0)

    const corpus: AliasRow[] = t.db
      .select({ issuerId: issuer.id, issuerName: issuer.name, aliasText: issuerAlias.aliasText })
      .from(issuerAlias)
      .innerJoin(issuer, eq(issuerAlias.issuerId, issuer.id))
      .all()
    const matcher = buildIssuerMatcher(corpus)
    expect(tradelines.filter((tl) => matcher.match(tl.creditorName)).length).toBeGreaterThan(0)
  })

  it('commits every tradeline as a card with last-4 preserved', () => {
    const db = t.db
    db.transaction((tx) => {
      for (const tl of tradelines) {
        tx.insert(card)
          .values({
            rawCreditorName: tl.creditorName,
            rawAccountLabel: tl.accountType,
            last4: tl.last4,
            status: tl.status,
            openedDate: tl.openedDate,
            closedDate: tl.closedDate,
            source: 'imported'
          })
          .run()
      }
    })
    expect(db.select({ n: sql<number>`count(*)` }).from(card).get()?.n).toBe(tradelines.length)
    expect(
      db.select({ n: sql<number>`count(*)` }).from(card).where(sql`last4 is not null`).get()?.n
    ).toBeGreaterThan(0)
  })

  it('round-trips parse -> commit -> read via the router, flagging duplicates on re-import', async () => {
    const caller = appRouter.createCaller({ db: routerT.db })
    const b64 = readFileSync(PDF).toString('base64')

    const preview = await caller.importer.parseEquifax({ base64: b64 })
    expect(preview.duplicates).toBe(0)

    const rows = preview.tradelines
      .filter((tl) => tl.isCreditCard && !tl.duplicate)
      .map((tl) => ({
        creditorName: tl.creditorName,
        accountType: tl.accountType,
        last4: tl.last4,
        issuerId: tl.suggestedIssuerId,
        openedDate: tl.openedDate,
        closedDate: tl.closedDate,
        status: tl.status
      }))
    const res = await caller.importer.commit({ ownerPersonId: null, rows })
    expect(res.created).toBe(rows.length)

    const stored = await caller.cards.list()
    expect(stored.filter((c) => c.status === 'closed' && c.closedDate).length).toBeGreaterThan(0)
    expect(stored.filter((c) => c.issuerId != null).length).toBeGreaterThan(0)

    const preview2 = await caller.importer.parseEquifax({ base64: b64 })
    const dupCreditCards = preview2.tradelines.filter((tl) => tl.isCreditCard && tl.duplicate)
    expect(dupCreditCards).toHaveLength(rows.length)
  })
})
