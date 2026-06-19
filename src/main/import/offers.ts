import { eq, and, sql } from 'drizzle-orm'
import type { DB } from '../db'
import { productOffer, cardProduct, issuer, pointProgram } from '../db/schema'
import { parseCsv } from './csv'
import { stripIssuerPrefix } from './naming'

/** The only networks unambiguously inferable from issuer (Visa/MC vary). */
function inferNetwork(issuerName: string): string | null {
  if (/american express|amex/i.test(issuerName)) return 'Amex'
  if (/discover/i.test(issuerName)) return 'Discover'
  return null
}

function findOrCreateIssuer(db: DB, name: string): number {
  const existing = db
    .select({ id: issuer.id })
    .from(issuer)
    .where(sql`lower(${issuer.name}) = ${name.toLowerCase()}`)
    .get()
  if (existing) return existing.id
  return db.insert(issuer).values({ name }).returning({ id: issuer.id }).get().id
}

function findOrCreateProduct(
  db: DB,
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

/** Match a currency name (e.g. "Amex MR") to a seeded point program. */
function programIdForCurrency(db: DB, currency: string | null): number | null {
  if (!currency) return null
  const p = db
    .select({ id: pointProgram.id })
    .from(pointProgram)
    .where(sql`lower(${pointProgram.name}) = ${currency.toLowerCase()}`)
    .get()
  return p?.id ?? null
}

const numOrNull = (s: string | undefined): number | null => {
  if (s == null || s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const centsOrNull = (s: string | undefined): number | null => {
  const n = numOrNull(s)
  return n == null ? null : Math.round(n * 100)
}

export interface OfferImportResult {
  created: number
  updated: number
  total: number
}

/**
 * Import offers from the normalized signup-bonus CSV. Find-or-creates the issuer
 * and card product per row, then upserts one offer per product (idempotent).
 */
export function importOffersCsv(db: DB, text: string): OfferImportResult {
  const rows = parseCsv(text)
  const required = ['card_name', 'issuer', 'bonus_amount', 'bonus_currency']
  if (rows.length === 0 || !required.every((c) => c in rows[0])) {
    throw new Error('CSV does not match the signup-bonus format')
  }

  let created = 0
  let updated = 0
  db.transaction((tx) => {
    const h = tx as unknown as DB
    for (const r of rows) {
      const name = r.card_name?.trim()
      if (!name) continue
      const issuerName = r.issuer?.trim() || name.split(' ')[0]
      const isBusiness = r.is_business?.toLowerCase() === 'true'
      const feeCents = centsOrNull(r.annual_fee_usd)
      const network = inferNetwork(issuerName)
      const issuerId = findOrCreateIssuer(h, issuerName)
      const productName = stripIssuerPrefix(name, issuerName)
      const productId = findOrCreateProduct(h, issuerId, productName, isBusiness, feeCents, network)

      const currency = r.bonus_currency?.trim() || null
      const isCash = currency === 'USD'
      const amount = numOrNull(r.bonus_amount)
      const values = {
        cardProductId: productId,
        rewardKind: isCash
          ? ('cash' as const)
          : /mile/i.test(currency ?? '')
            ? ('miles' as const)
            : ('points' as const),
        currency,
        pointProgramId: isCash ? null : programIdForCurrency(h, currency),
        pointsAmount: isCash ? null : amount != null ? Math.round(amount) : null,
        cashAmountCents: isCash && amount != null ? Math.round(amount * 100) : null,
        pointValueCpp: numOrNull(r.point_value_cpp),
        minSpendCents: centsOrNull(r.min_spend_usd),
        windowMonths: numOrNull(r.spend_window_months),
        notes: r.notes?.trim() || null
      }

      const existing = h
        .select({ id: productOffer.id })
        .from(productOffer)
        .where(eq(productOffer.cardProductId, productId))
        .get()
      if (existing) {
        h.update(productOffer)
          .set({ ...values, updatedAt: Date.now() })
          .where(eq(productOffer.id, existing.id))
          .run()
        updated++
      } else {
        h.insert(productOffer).values(values).run()
        created++
      }
    }
  })
  return { created, updated, total: created + updated }
}
