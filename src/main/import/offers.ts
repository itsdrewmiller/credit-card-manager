import { eq, sql } from 'drizzle-orm'
import type { DB, DbLike } from '../db'
import { productOffer, pointProgram, cardProduct } from '../db/schema'
import { parseCsv } from './csv'
import { stripIssuerPrefix, cleanCardName, canonicalProductName } from './naming'
import {
  numOrNull,
  centsOrNull,
  normalizeNetwork,
  findOrCreateIssuer,
  findOrCreateProduct
} from './shared'

/** The only networks unambiguously inferable from issuer (Visa/MC vary). */
function inferNetwork(issuerName: string): string | null {
  if (/american express|amex/i.test(issuerName)) return 'Amex'
  if (/discover/i.test(issuerName)) return 'Discover'
  return null
}

/** Match a currency name (e.g. "Amex MR") to a seeded point program. */
function programIdForCurrency(db: DbLike, currency: string | null): number | null {
  if (!currency) return null
  const p = db
    .select({ id: pointProgram.id })
    .from(pointProgram)
    .where(sql`lower(${pointProgram.name}) = ${currency.toLowerCase()}`)
    .get()
  return p?.id ?? null
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

  // Optional column: when the feed doesn't carry referral values, leave any
  // manually-entered ones untouched on refresh.
  const hasReferralColumn = rows.length > 0 && 'referral_value_usd' in rows[0]

  let created = 0
  let updated = 0
  db.transaction((h) => {
    for (const r of rows) {
      const name = r.card_name?.trim()
      if (!name) continue
      const issuerName = r.issuer?.trim() || name.split(' ')[0]
      const isBusiness = r.is_business?.toLowerCase() === 'true'
      const feeCents = centsOrNull(r.annual_fee_usd)
      // Use the CSV's network if given, else infer (Amex/Discover only).
      const network = normalizeNetwork(r.network) ?? inferNetwork(issuerName)
      const issuerId = findOrCreateIssuer(h, issuerName)
      const productName = canonicalProductName(stripIssuerPrefix(cleanCardName(name), issuerName))
      const productId = findOrCreateProduct(h, issuerId, productName, isBusiness, feeCents, network)

      // Official application page travels on the product; only overwrite when
      // the feed actually provides one, so manual entries survive refreshes.
      const applyUrl = r.apply_url?.trim() || null
      if (applyUrl) {
        h.update(cardProduct).set({ applyUrl }).where(eq(cardProduct.id, productId)).run()
      }

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
        ...(hasReferralColumn ? { referralValueCents: centsOrNull(r.referral_value_usd) } : {}),
        feeWaivedFirstYear: r.annual_fee_waived_y1?.trim().toLowerCase() === 'true',
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
