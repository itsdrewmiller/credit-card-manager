import { eq, and, sql } from 'drizzle-orm'
import type { DB } from './index'
import { issuer, cardProduct } from './schema'
import { canonicalProductName } from '../import/naming'

/**
 * Products that aren't in the offer feed (signup_bonuses.csv) but should always
 * be available to pick — e.g. cards with no current public bonus.
 */
export const EXTRA_PRODUCTS: {
  issuer: string
  name: string
  network?: string
  isBusiness?: boolean
  annualFeeCents?: number
}[] = [
  { issuer: 'Wells Fargo', name: 'Signify Business', network: 'Visa', isBusiness: true, annualFeeCents: 0 }
]

/** Idempotently add the supplemental products (find-or-create by issuer + name). */
export function seedExtraProducts(db: DB): number {
  let added = 0
  for (const p of EXTRA_PRODUCTS) {
    const iss = db
      .select({ id: issuer.id })
      .from(issuer)
      .where(sql`lower(${issuer.name}) = ${p.issuer.toLowerCase()}`)
      .get()
    const issuerId = iss
      ? iss.id
      : db.insert(issuer).values({ name: p.issuer }).returning({ id: issuer.id }).get().id

    const name = canonicalProductName(p.name)
    const exists = db
      .select({ id: cardProduct.id })
      .from(cardProduct)
      .where(and(eq(cardProduct.issuerId, issuerId), sql`lower(${cardProduct.name}) = ${name.toLowerCase()}`))
      .get()
    if (exists) continue
    db.insert(cardProduct)
      .values({
        issuerId,
        name,
        network: p.network,
        isBusiness: p.isBusiness ?? false,
        defaultAnnualFeeCents: p.annualFeeCents
      })
      .run()
    added++
  }
  return added
}
