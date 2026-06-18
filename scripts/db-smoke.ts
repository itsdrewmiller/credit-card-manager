/**
 * Headless data-layer smoke test (runs under plain Node via tsx, no Electron).
 *
 * Proves: migrations apply, catalog seeds, FKs work, and a representative
 * "compute bonus value from point valuation" round-trip behaves.
 *
 * Run: npm run db:generate && npm run db:smoke
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { openDatabase, runMigrations } from '../src/main/db/index'
import { seedCatalog } from '../src/main/db/seed'
import { person, pointProgram, card, signupBonus, issuer, cardProduct } from '../src/main/db/schema'
import { cardMissingFields } from '../src/main/domain/needsInfo'
import { computeBonus } from '../src/main/domain/bonus'
import { benefitStatus, benefitEvCents } from '../src/main/domain/benefit'
import { personVelocity } from '../src/main/domain/velocity'
import { appRouter } from '../src/main/trpc/router'

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ FAIL: ${msg}`)
    process.exit(1)
  }
  console.log(`✓ ${msg}`)
}

const dir = mkdtempSync(join(tmpdir(), 'ccm-smoke-'))
const dbPath = join(dir, 'test.db')

try {
  const { db } = openDatabase(dbPath)
  runMigrations(db, join(process.cwd(), 'drizzle'))
  console.log('• migrations applied')

  const seeded = seedCatalog(db)
  assert(seeded.issuers > 0 && seeded.products > 0, `catalog seeded (${seeded.products} products)`)

  // idempotency
  const seededAgain = seedCatalog(db)
  assert(seededAgain.products === 0, 'second seed is a no-op (idempotent)')

  // issuers / products present
  const issuers = db.select().from(issuer).all()
  const products = db.select().from(cardProduct).all()
  assert(issuers.some((i) => i.name === 'Chase'), 'Chase issuer exists')
  assert(products.some((p) => p.name === 'Sapphire Reserve'), 'Sapphire Reserve product exists')

  // create a person + point program (1.5 cpp) + card + signup bonus
  const drew = db.insert(person).values({ name: 'Drew' }).returning().get()
  const ur = db
    .insert(pointProgram)
    .values({ name: 'Chase UR', ownerPersonId: drew.id, kind: 'transferable', valuationCpp: 1.5 })
    .returning()
    .get()

  const chaseProduct = products.find((p) => p.name === 'Sapphire Reserve')!
  const csr = db
    .insert(card)
    .values({
      cardProductId: chaseProduct.id,
      ownerPersonId: drew.id,
      status: 'open',
      openedDate: '2026-01-15',
      annualFeeCents: 55000
    })
    .returning()
    .get()

  const bonus = db
    .insert(signupBonus)
    .values({
      cardId: csr.id,
      rewardKind: 'points',
      pointProgramId: ur.id,
      pointsAmount: 60000,
      targetSpendCents: 400000,
      spendSoFarCents: 250000,
      deadline: '2026-04-15'
    })
    .returning()
    .get()

  // computeBonus: value = points * cpp = 60000 * 1.5c = $900; remaining = $1500; not met
  const computed = computeBonus(bonus, ur.valuationCpp)
  assert(computed.valueCents === 90000, `computeBonus value = $900 (got $${(computed.valueCents ?? 0) / 100})`)
  assert(computed.remainingSpendCents === 150000, `computeBonus remaining = $1500`)
  assert(computed.spendMet === false, 'computeBonus spendMet false below target')

  // a cash bonus uses cash value directly; meeting target flips spendMet
  const cashComputed = computeBonus(
    { cashAmountCents: 75000, targetSpendCents: 300000, spendSoFarCents: 300000 },
    null
  )
  assert(cashComputed.valueCents === 75000, 'cash bonus value = $750 (ignores cpp)')
  assert(cashComputed.spendMet === true, 'computeBonus spendMet true at target')

  // relational read
  const owned = db.select().from(card).where(eq(card.ownerPersonId, drew.id)).all()
  assert(owned.length === 1, "Drew owns 1 card")

  // --- Needs-info derivation (Phase 1) ---
  // The CSR above has product+owner+fee+openedDate but no statement/payment day.
  const csrMissing = cardMissingFields(csr)
  assert(
    csrMissing.includes('statementDay') &&
      csrMissing.includes('paymentDay') &&
      !csrMissing.includes('openedDate'),
    'needs-info flags missing statement/payment days but not the set open date'
  )

  // A bare imported stub is missing nearly everything.
  const stub = db
    .insert(card)
    .values({ rawCreditorName: 'CHASE CARD', status: 'open', source: 'imported' })
    .returning()
    .get()
  assert(cardMissingFields(stub).length === 6, 'a fresh import stub is missing all 6 required fields')

  // --- Benefit status + EV (Phase 3) ---
  const at = new Date('2026-06-18T00:00:00')
  assert(benefitEvCents({ amountCents: 1000, unitValue: 1 }) === 1000, 'benefit EV = $10 at 1.0x')
  assert(benefitEvCents({ amountCents: 1000, unitValue: 0.8 }) === 800, 'benefit EV = $8 at 0.8x')
  assert(benefitStatus({ used: true, useBy: '2026-12-31' }, at) === 'used', 'used benefit => used')
  assert(
    benefitStatus({ useBy: '2026-01-01' }, at) === 'expired',
    'past use-by => expired'
  )
  assert(
    benefitStatus({ useAfter: '2026-09-01', useBy: '2026-12-31' }, at) === 'upcoming',
    'before use-after => upcoming'
  )
  assert(
    benefitStatus({ useAfter: '2026-01-01', useBy: '2026-12-31' }, at) === 'available',
    'inside window => available'
  )

  // Closed/historical cards are never nagged.
  const closed = db
    .insert(card)
    .values({ rawCreditorName: 'OLD CARD', status: 'closed', source: 'manual' })
    .returning()
    .get()
  assert(cardMissingFields(closed).length === 0, 'closed cards are excluded from needs-info')

  // --- 5/24 velocity (Phase 4) ---
  const now = new Date('2026-06-18T00:00:00')
  const vCards = [
    { id: 1, openedDate: '2026-01-10', businessId: null, status: 'open' }, // counts
    { id: 2, openedDate: '2025-06-01', businessId: null, status: 'closed' }, // counts (opened, now closed)
    { id: 3, openedDate: '2025-03-01', businessId: 7, status: 'open' }, // business -> excluded
    { id: 4, openedDate: '2023-01-01', businessId: null, status: 'open' }, // >24mo -> excluded
    { id: 5, openedDate: null, businessId: null, status: 'applied' } // never opened -> excluded
  ]
  const v = personVelocity(vCards, now)
  assert(v.count === 2, `5/24 counts only personal opened-in-24mo cards (got ${v.count})`)
  assert(v.atChase524 === false, 'under 5/24 with 2 cards')
  assert(v.nextFreeDate === '2027-06-01', `next slot frees 24mo after oldest (got ${v.nextFreeDate})`)

  const heavy = personVelocity(
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      openedDate: '2026-02-01',
      businessId: null,
      status: 'open'
    })),
    now
  )
  assert(heavy.atChase524 === true, '5 personal cards in 24mo => at 5/24')

  // FK cascade: deleting the card removes its bonus
  db.delete(card).where(eq(card.id, csr.id)).run()
  const orphanBonuses = db.select().from(signupBonus).where(eq(signupBonus.cardId, csr.id)).all()
  assert(orphanBonuses.length === 0, 'deleting a card cascades to its signup bonuses')

  // --- Export / restore round-trip (Phase 6) via the real tRPC router ---
  const caller = appRouter.createCaller({ db })
  const snap = await caller.exporter.snapshot()
  const total = Object.values(snap.data).reduce((n, rows) => n + rows.length, 0)
  assert(snap.version === 1 && total > 0, `snapshot captured ${total} rows`)

  const { db: db2 } = openDatabase(join(dir, 'restore.db'))
  runMigrations(db2, join(process.cwd(), 'drizzle'))
  const caller2 = appRouter.createCaller({ db: db2 })
  const restored = await caller2.exporter.restore({
    version: snap.version,
    data: snap.data as Record<string, Record<string, unknown>[]>
  })
  assert(restored.inserted === total, `restore re-inserted all ${total} rows`)

  const snap2 = await caller2.exporter.snapshot()
  const total2 = Object.values(snap2.data).reduce((n, rows) => n + rows.length, 0)
  assert(total2 === total, 're-exported snapshot matches the original row count')
  assert(
    snap2.data.card.length === snap.data.card.length &&
      snap2.data.signupBonus.length === snap.data.signupBonus.length,
    'cards and bonuses survive a backup round-trip'
  )

  console.log('\n✅ All smoke checks passed.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
