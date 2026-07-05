import { eq } from 'drizzle-orm'
import type { DB, DbLike } from './index'
import { cardProduct, issuer, card, referral, productOffer, productBenefit } from './schema'
import { stripIssuerPrefix, cleanCardName, canonicalProductName } from '../import/naming'

/** Repoint everything from a duplicate product onto the keeper, then delete it. */
function mergeProduct(db: DbLike, dupId: number, keeperId: number): void {
  db.update(card).set({ cardProductId: keeperId }).where(eq(card.cardProductId, dupId)).run()
  db.update(referral).set({ cardProductId: keeperId }).where(eq(referral.cardProductId, dupId)).run()
  db.update(productBenefit)
    .set({ cardProductId: keeperId })
    .where(eq(productBenefit.cardProductId, dupId))
    .run()

  // Offers: keep the keeper's (if any), otherwise move the dup's over.
  const keeperHasOffer = db
    .select({ id: productOffer.id })
    .from(productOffer)
    .where(eq(productOffer.cardProductId, keeperId))
    .get()
  if (keeperHasOffer) {
    db.delete(productOffer).where(eq(productOffer.cardProductId, dupId)).run()
  } else {
    db.update(productOffer)
      .set({ cardProductId: keeperId })
      .where(eq(productOffer.cardProductId, dupId))
      .run()
  }

  // Carry over metadata the keeper is missing.
  const k = db.select().from(cardProduct).where(eq(cardProduct.id, keeperId)).get()
  const d = db.select().from(cardProduct).where(eq(cardProduct.id, dupId)).get()
  if (k && d) {
    db.update(cardProduct)
      .set({
        network: k.network ?? d.network,
        defaultAnnualFeeCents: k.defaultAnnualFeeCents ?? d.defaultAnnualFeeCents,
        isBusiness: k.isBusiness || d.isBusiness
      })
      .where(eq(cardProduct.id, keeperId))
      .run()
  }
  db.delete(cardProduct).where(eq(cardProduct.id, dupId)).run()
}

/**
 * Normalize product names (strip the issuer prefix) and merge resulting
 * duplicates within each issuer. Idempotent: a no-op once names are clean.
 */
export function dedupeCatalog(db: DB): { renamed: number; merged: number } {
  let renamed = 0
  let merged = 0
  db.transaction((tx) => {
    const rows = tx
      .select({
        id: cardProduct.id,
        name: cardProduct.name,
        issuerId: cardProduct.issuerId,
        issuerName: issuer.name
      })
      .from(cardProduct)
      .innerJoin(issuer, eq(cardProduct.issuerId, issuer.id))
      .orderBy(cardProduct.id)
      .all()

    const keeper = new Map<string, number>() // `${issuerId}|${name}` -> keeper id
    for (const p of rows) {
      const canonical = canonicalProductName(stripIssuerPrefix(cleanCardName(p.name), p.issuerName))
      const key = `${p.issuerId}|${canonical.toLowerCase()}`
      const existing = keeper.get(key)
      if (existing != null && existing !== p.id) {
        mergeProduct(tx, p.id, existing)
        merged++
      } else {
        keeper.set(key, p.id)
        if (canonical !== p.name) {
          tx.update(cardProduct).set({ name: canonical }).where(eq(cardProduct.id, p.id)).run()
          renamed++
        }
      }
    }
  })
  return { renamed, merged }
}
