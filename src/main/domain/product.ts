import { eq } from 'drizzle-orm'
import type { DB } from '../db'
import { cardProduct } from '../db/schema'

export interface ProductDefaults {
  issuerId: number | null
  network: string | null
  annualFeeCents: number | null
}

/** Look up the issuer/network/annual-fee a card inherits from its product. */
export function productDefaults(db: DB, productId: number): ProductDefaults | null {
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
>(db: DB, input: T): T {
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
