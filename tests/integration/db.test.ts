/**
 * Data-layer integration tests: real migrations + seeding + the tRPC router
 * via createCaller, against a temp SQLite DB (no Electron).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb, type TestDb } from '../helpers/db'
import { seedIssuers } from '../../src/main/db/issuers'
import { person, pointProgram, card, signupBonus, issuer, cardProduct } from '../../src/main/db/schema'
import { appRouter } from '../../src/main/trpc/router'

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
})
