import { eq } from 'drizzle-orm'
import type { DbLike } from '../db'
import { benefit, cardProduct, productBenefit } from '../db/schema'

export interface ProductDefaults {
  issuerId: number | null
  network: string | null
  annualFeeCents: number | null
}

/** Look up the issuer/network/annual-fee a card inherits from its product. */
export function productDefaults(db: DbLike, productId: number): ProductDefaults | null {
  return (
    db
      .select({
        issuerId: cardProduct.issuerId,
        network: cardProduct.network,
        annualFeeCents: cardProduct.defaultAnnualFeeCents
      })
      .from(cardProduct)
      .where(eq(cardProduct.id, productId))
      .get() ?? null
  )
}

/** Fill issuer/network/annual-fee on a card payload from its product when blank. */
export function applyProductDefaults<
  T extends {
    cardProductId?: number | null
    issuerId?: number | null
    network?: string | null
    annualFeeCents?: number | null
  }
>(db: DbLike, input: T): T {
  if (input.cardProductId == null) return input
  const d = productDefaults(db, input.cardProductId)
  if (!d) return input
  return {
    ...input,
    issuerId: input.issuerId ?? d.issuerId,
    network: input.network ?? d.network,
    annualFeeCents: input.annualFeeCents ?? d.annualFeeCents
  }
}

/** Products seed the card-level 5/24 flag when first assigned; the card value
 *  stays the single source of truth afterward (velocity never reads products). */
export function productReportsToPersonal(db: DbLike, cardProductId: number): boolean {
  return (
    db
      .select({ r: cardProduct.reportsToPersonal })
      .from(cardProduct)
      .where(eq(cardProduct.id, cardProductId))
      .get()?.r ?? false
  )
}

/**
 * Copy a product's benefit templates onto a card. Idempotent by benefit name,
 * so it won't duplicate benefits already present on the card.
 */
export function applyProductBenefits(db: DbLike, cardId: number, cardProductId: number): void {
  const templates = db
    .select()
    .from(productBenefit)
    .where(eq(productBenefit.cardProductId, cardProductId))
    .all()
  if (templates.length === 0) return
  const have = new Set(
    db.select({ name: benefit.name }).from(benefit).where(eq(benefit.cardId, cardId)).all().map((b) => b.name)
  )
  for (const t of templates) {
    if (have.has(t.name)) continue
    db.insert(benefit)
      .values({
        cardId,
        name: t.name,
        category: t.category,
        amountCents: t.amountCents,
        valuePct: t.valuePct,
        period: t.period,
        notes: t.notes
      })
      .run()
  }
}
