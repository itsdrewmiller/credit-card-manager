/**
 * Data-layer integration tests: real migrations + seeding + the tRPC router
 * via createCaller, against a temp SQLite DB (no Electron).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb, type TestDb } from '../helpers/db'
import { seedIssuers } from '../../src/main/db/issuers'
import { seedCashbackRates } from '../../src/main/db/cashback'
import { person, pointProgram, card, signupBonus, issuer, cardProduct } from '../../src/main/db/schema'
import { appRouter } from '../../src/main/trpc/router'
import { todayIso } from '../../src/shared/dates'

describe('database + router integration', () => {
  let t: TestDb
  let restoreT: TestDb

  beforeAll(() => {
    t = makeTestDb()
    restoreT = makeTestDb()
  })
  afterAll(() => {
    t.cleanup()
    restoreT.cleanup()
  })

  it('seeds issuers idempotently', () => {
    const seeded = seedIssuers(t.db)
    expect(seeded.issuers).toBeGreaterThan(0)
    expect(seeded.aliases).toBeGreaterThan(0)

    const again = seedIssuers(t.db)
    expect(again.issuers).toBe(0)
    expect(again.aliases).toBe(0)
  })

  it('cascades card deletion to its signup bonuses', () => {
    const db = t.db
    const chase = db.select().from(issuer).all().find((i) => i.name === 'Chase')!
    expect(chase).toBeDefined()

    const csrProduct = db
      .insert(cardProduct)
      .values({ issuerId: chase.id, name: 'Sapphire Reserve', network: 'Visa', defaultAnnualFeeCents: 55000 })
      .returning()
      .get()
    const drew = db.insert(person).values({ name: 'Drew' }).returning().get()
    const ur = db
      .insert(pointProgram)
      .values({ name: 'Chase UR', ownerPersonId: drew.id, kind: 'transferable', valuationCpp: 1.5 })
      .returning()
      .get()
    const csr = db
      .insert(card)
      .values({
        cardProductId: csrProduct.id,
        ownerPersonId: drew.id,
        status: 'open',
        openedDate: '2026-01-15',
        annualFeeCents: 55000
      })
      .returning()
      .get()
    db.insert(signupBonus)
      .values({
        cardId: csr.id,
        rewardKind: 'points',
        pointProgramId: ur.id,
        pointsAmount: 60000,
        targetSpendCents: 400000,
        spendSoFarCents: 250000,
        deadline: '2026-04-15'
      })
      .run()

    expect(db.select().from(card).where(eq(card.ownerPersonId, drew.id)).all()).toHaveLength(1)

    db.delete(card).where(eq(card.id, csr.id)).run()
    expect(db.select().from(signupBonus).where(eq(signupBonus.cardId, csr.id)).all()).toHaveLength(0)
  })

  it('seeds baseline earn rates without clobbering user edits', () => {
    const db = t.db
    const chase = db.select().from(issuer).all().find((i) => i.name === 'Chase')!
    // The catalog seeded 'Sapphire Reserve' earlier in this suite.
    const filled = seedCashbackRates(db)
    expect(filled).toBeGreaterThan(0)
    const csr = db
      .select()
      .from(cardProduct)
      .all()
      .find((p) => p.issuerId === chase.id && p.name === 'Sapphire Reserve')!
    expect(csr.defaultCashbackPct).toBe(1)

    // A user edit survives re-seeding.
    db.update(cardProduct)
      .set({ defaultCashbackPct: 3 })
      .where(eq(cardProduct.id, csr.id))
      .run()
    seedCashbackRates(db)
    const after = db.select().from(cardProduct).all().find((p) => p.id === csr.id)!
    expect(after.defaultCashbackPct).toBe(3)
  })

  it('records spend deltas as dated ledger entries and reports on them', async () => {
    const caller = appRouter.createCaller({ db: t.db })
    const c = await caller.cards.create({ rawCreditorName: 'LEDGER TEST', status: 'open', source: 'manual' })

    const bonus = await caller.bonuses.create({
      cardId: c.id,
      targetSpendCents: 400000,
      spendSoFarCents: 100000,
      startDate: '2026-01-01',
      deadline: '2026-04-01'
    })
    // Inline edits set a new total; the router turns that into a delta entry.
    await caller.bonuses.update({ id: bonus.id, spendSoFarCents: 250000 })
    await caller.bonuses.update({ id: bonus.id, spendSoFarCents: 220000 }) // correction

    const entries = t.db.query.spendEntry.findMany().sync().filter((e) => e.bonusId === bonus.id)
    expect(entries.map((e) => e.amountCents)).toEqual([100000, 150000, -30000])
    // Spend is dated by when it was recorded, not by the bonus window. Use the
    // app's own local-date helper: toISOString() is UTC and disagrees with it
    // for a few hours every evening.
    expect(entries[0].date).toBe(todayIso())

    // Marking received stamps a receivedDate, which puts value on the timeline.
    await caller.bonuses.update({ id: bonus.id, received: true, cashAmountCents: 75000 })
    const report = await caller.reports.overview()
    expect(report.totals.spendCents).toBeGreaterThanOrEqual(220000)
    expect(report.totals.bonusReturnCents).toBeGreaterThanOrEqual(75000)
    expect(report.months.length).toBeGreaterThan(0)

    await caller.cards.delete({ id: c.id }) // cascades bonus + entries
    const orphans = t.db.query.spendEntry.findMany().sync().filter((e) => e.bonusId === bonus.id)
    expect(orphans).toHaveLength(0)
  })

  it('flags recurring payments whose card stops earning a bonus', async () => {
    const caller = appRouter.createCaller({ db: t.db })
    const c = await caller.cards.create({ rawCreditorName: 'RECURRING TEST', status: 'open', source: 'manual' })
    const bonus = await caller.bonuses.create({ cardId: c.id, targetSpendCents: 100000, spendSoFarCents: 0 })
    const payment = await caller.recurringPayments.create({ name: 'Netflix', cardId: c.id })

    let rows = await caller.recurringPayments.list()
    expect(rows.find((r) => r.id === payment.id)?.cardStatus).toBe('working')

    await caller.bonuses.update({ id: bonus.id, spendSoFarCents: 100000 })
    rows = await caller.recurringPayments.list()
    expect(rows.find((r) => r.id === payment.id)?.cardStatus).toBe('bonus_done')

    // Deleting the card unassigns rather than deleting the payment.
    await caller.cards.delete({ id: c.id })
    rows = await caller.recurringPayments.list()
    expect(rows.find((r) => r.id === payment.id)?.cardStatus).toBeNull()

    await caller.recurringPayments.delete({ id: payment.id })
  })

  it('seeds the card 5/24 flag from a reporting product, once', async () => {
    const caller = appRouter.createCaller({ db: t.db })
    const chase = t.db.select().from(issuer).all().find((i) => i.name === 'Chase')!
    const spark = await caller.products.create({
      issuerId: chase.id,
      name: 'Reporting Biz Card',
      isBusiness: true,
      reportsToPersonal: true
    })

    // Creating a card with the product seeds the flag on.
    const c = await caller.cards.create({ cardProductId: spark.id, status: 'open', source: 'manual' })
    expect(c.reportsToPersonal).toBe(true)

    // The card value is authoritative: turning it off sticks through edits.
    await caller.cards.update({ id: c.id, reportsToPersonal: false })
    const after = await caller.cards.update({ id: c.id, notes: 'still off' })
    expect(after.reportsToPersonal).toBe(false)

    // Newly assigning the product to another card seeds it there too.
    const stub = await caller.cards.create({ rawCreditorName: 'STUB', status: 'open', source: 'manual' })
    expect(stub.reportsToPersonal).toBe(false)
    const assigned = await caller.cards.update({ id: stub.id, cardProductId: spark.id })
    expect(assigned.reportsToPersonal).toBe(true)

    await caller.cards.delete({ id: c.id })
    await caller.cards.delete({ id: stub.id })
    await caller.products.delete({ id: spark.id })
  })

  it('sweeps pending benefits when a card closes, keeping history', async () => {
    const caller = appRouter.createCaller({ db: t.db })
    const c = await caller.cards.create({ rawCreditorName: 'CLOSE TEST', status: 'open', source: 'manual' })
    const today = new Date().toISOString().slice(0, 10)

    const mk = (over: Record<string, unknown>) =>
      caller.benefits.create({ cardId: c.id, name: 'X', ...over } as never)
    await mk({ name: 'used past', used: true, usedDate: '2026-01-15', useBy: '2026-01-31' })
    await mk({ name: 'expired unused', used: false, useBy: '2026-01-31' })
    await mk({ name: 'partially used future', used: false, usedAmountCents: 500, useBy: '2099-12-31' })
    await mk({ name: 'pending future', used: false, useBy: '2099-12-31' })
    await mk({ name: 'pending undated', used: false })

    await caller.cards.update({ id: c.id, status: 'closed' })
    const remaining = t.db.query.benefit
      .findMany()
      .sync()
      .filter((b) => b.cardId === c.id)
    expect(remaining.map((b) => b.name).sort()).toEqual([
      'expired unused',
      'partially used future',
      'used past'
    ])
    void today

    await caller.cards.delete({ id: c.id })
  })

  it('tracks autopay on cards, defaulting to off', async () => {
    const caller = appRouter.createCaller({ db: t.db })
    const plain = await caller.cards.create({ rawCreditorName: 'AUTOPAY TEST', status: 'open', source: 'manual' })
    expect(plain.autopay).toBe(false)

    await caller.cards.update({ id: plain.id, autopay: true })
    const after = await caller.cards.get({ id: plain.id })
    expect(after?.autopay).toBe(true)

    await caller.cards.delete({ id: plain.id })
  })

  it('auto-applies product benefit templates to new cards, idempotently', async () => {
    const db = t.db
    const caller = appRouter.createCaller({ db })
    const product = db.select().from(cardProduct).all().find((p) => p.name === 'Sapphire Reserve')!

    await caller.productBenefits.create({
      cardProductId: product.id,
      name: 'Annual Travel Credit',
      amountCents: 30000,
      period: 'annual'
    })
    const newCard = await caller.cards.create({
      cardProductId: product.id,
      status: 'open',
      source: 'manual'
    })
    const benefits = await caller.benefits.listByCard({ cardId: newCard.id })
    expect(
      benefits.some((b) => b.name === 'Annual Travel Credit' && b.amountCents === 30000)
    ).toBe(true)

    // Re-editing the card must not duplicate the benefit.
    await caller.cards.update({ id: newCard.id, cardProductId: product.id })
    const after = await caller.benefits.listByCard({ cardId: newCard.id })
    expect(after.filter((b) => b.name === 'Annual Travel Credit')).toHaveLength(1)
  })

  it('survives an export/restore round-trip via the router', async () => {
    const caller = appRouter.createCaller({ db: t.db })
    const snap = await caller.exporter.snapshot()
    const total = Object.values(snap.data).reduce((n, rows) => n + rows.length, 0)
    expect(snap.version).toBe(1)
    expect(total).toBeGreaterThan(0)

    const caller2 = appRouter.createCaller({ db: restoreT.db })
    const restored = await caller2.exporter.restore({
      version: snap.version,
      data: snap.data as Record<string, Record<string, unknown>[]>
    })
    expect(restored.inserted).toBe(total)

    const snap2 = await caller2.exporter.snapshot()
    const total2 = Object.values(snap2.data).reduce((n, rows) => n + rows.length, 0)
    expect(total2).toBe(total)
    expect(snap2.data.card).toHaveLength(snap.data.card.length)
    expect(snap2.data.signupBonus).toHaveLength(snap.data.signupBonus.length)
  })

  it('rejects restores with a wrong version, unknown tables, or malformed rows', async () => {
    const caller = appRouter.createCaller({ db: restoreT.db })

    await expect(caller.exporter.restore({ version: 99, data: {} })).rejects.toThrow(
      /Unsupported backup version 99/
    )

    await expect(
      caller.exporter.restore({ version: 1, data: { notATable: [] } as never })
    ).rejects.toThrow()

    await expect(
      caller.exporter.restore({
        version: 1,
        data: { person: [{ notes: 'row with no name' }] } as never
      })
    ).rejects.toThrow()

    // Validation failures must not have wiped anything.
    const snap = await caller.exporter.snapshot()
    expect(snap.data.person.length).toBeGreaterThan(0)
  })

  it('recommends waiting while open bonus min-spend outpaces tracked spend', async () => {
    const caller = appRouter.createCaller({ db: t.db })
    const chase = t.db.select().from(issuer).all().find((i) => i.name === 'Chase')!
    const product = t.db
      .insert(cardProduct)
      .values({ issuerId: chase.id, name: 'Pace Test Card', network: 'Visa' })
      .returning()
      .get()
    const offer = await caller.offers.create({
      cardProductId: product.id,
      cashAmountCents: 50000,
      minSpendCents: 300000,
      windowMonths: 3
    })
    const tester = t.db.insert(person).values({ name: 'Pace Tester' }).returning().get()
    const held = t.db
      .insert(card)
      .values({ ownerPersonId: tester.id, status: 'open', openedDate: '2026-01-01' })
      .returning()
      .get()
    // $50k target with $1k tracked so far: months of open spend at any
    // realistic test-DB pace, so every candidate should wait.
    const deadline = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
    await caller.bonuses.create({
      cardId: held.id,
      targetSpendCents: 5000000,
      spendSoFarCents: 100000,
      deadline
    })
    await caller.recommendations.createRule({
      kind: 'finish_open_bonuses',
      enabled: true,
      params: '{"maxOpenMonths": 2, "lookbackMonths": 3}'
    })

    const { results } = await caller.recommendations.overview()
    const mine = results.find((r) => r.personId === tester.id)!
    expect(mine.recommended).toHaveLength(0)
    const cand = mine.blocked.find((c) => c.offerId === offer.id)!
    const block = cand.blocks.find((b) => b.kind === 'finish_open_bonuses')!
    expect(block.reason).toMatch(/open bonus spend/)
    // Wait date is knowable: the deadline retires the bonus if pace doesn't.
    expect(block.waitUntil).not.toBeNull()
    expect(block.waitUntil! <= deadline).toBe(true)
  })
})
