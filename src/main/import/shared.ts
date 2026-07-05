import { eq, and, sql } from 'drizzle-orm'
import type { DbLike } from '../db'
import { cardProduct, issuer } from '../db/schema'

/** "12.5" -> 12.5, blank/invalid -> null. */
export const numOrNull = (s: string | undefined): number | null => {
  if (s == null || s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Dollars string -> integer cents. "95" -> 9500, blank -> null. */
export const centsOrNull = (s: string | undefined): number | null => {
  const n = numOrNull(s)
  return n == null ? null : Math.round(n * 100)
}

/** Normalize a CSV network value to a canonical name; blank -> null. */
export function normalizeNetwork(s: string | undefined): string | null {
  const v = (s ?? '').trim()
  if (!v) return null
  if (/^mc$|master/i.test(v)) return 'Mastercard'
  if (/visa/i.test(v)) return 'Visa'
  if (/amex|american express/i.test(v)) return 'Amex'
  if (/discover/i.test(v)) return 'Discover'
  return v
}

export function findOrCreateIssuer(db: DbLike, name: string): number {
  const existing = db
    .select({ id: issuer.id })
    .from(issuer)
    .where(sql`lower(${issuer.name}) = ${name.toLowerCase()}`)
    .get()
  if (existing) return existing.id
  return db.insert(issuer).values({ name }).returning({ id: issuer.id }).get().id
}

export function findOrCreateProduct(
  db: DbLike,
  issuerId: number,
  name: string,
  isBusiness: boolean,
  annualFeeCents: number | null,
  network: string | null
): number {
  const existing = db
    .select({ id: cardProduct.id, network: cardProduct.network })
    .from(cardProduct)
    .where(
      and(eq(cardProduct.issuerId, issuerId), sql`lower(${cardProduct.name}) = ${name.toLowerCase()}`)
    )
    .get()
  if (existing) {
    if (existing.network == null && network != null) {
      db.update(cardProduct).set({ network }).where(eq(cardProduct.id, existing.id)).run()
    }
    return existing.id
  }
  return db
    .insert(cardProduct)
    .values({ issuerId, name, isBusiness, defaultAnnualFeeCents: annualFeeCents, network })
    .returning({ id: cardProduct.id })
    .get().id
}
