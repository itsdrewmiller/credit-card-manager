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
  { issuer: 'Wells Fargo', name: 'Signify Business', network: 'Mastercard', isBusiness: true, annualFeeCents: 0 },
  { issuer: 'Bank of America', name: 'Business Advantage Unlimited Cash', network: 'Mastercard', isBusiness: true, annualFeeCents: 0 },
  // Store card (no network); the Mastercard variant is a separate product.
  { issuer: 'TD Bank', name: 'Target Circle Card', annualFeeCents: 0 },
  // Synchrony private-label store card (no network).
  { issuer: 'Synchrony', name: 'Amazon Store Card', annualFeeCents: 0 },
  { issuer: 'Goldman Sachs', name: 'Apple Card', network: 'Mastercard', annualFeeCents: 0 },
  { issuer: 'U.S. Bank', name: 'Smartly', network: 'Visa', annualFeeCents: 0 },
  { issuer: 'Alliant Credit Union', name: 'Cashback Visa Signature', network: 'Visa', annualFeeCents: 0 },
  // Common downgrade / product-change targets — rarely carry a public bonus,
  // so the offer feed never creates them.
  { issuer: 'Chase', name: 'United Gateway', network: 'Visa', annualFeeCents: 0 },
  { issuer: 'Chase', name: 'Freedom Flex', network: 'Mastercard', annualFeeCents: 0 },
  { issuer: 'Chase', name: 'Freedom', network: 'Visa', annualFeeCents: 0 },
  { issuer: 'Chase', name: 'Marriott Bonvoy Bold', network: 'Visa', annualFeeCents: 0 },
  { issuer: 'Chase', name: 'IHG Classic', network: 'Mastercard', annualFeeCents: 0 },
  { issuer: 'American Express', name: 'Green', network: 'Amex', annualFeeCents: 15000 },
  { issuer: 'Citi', name: 'Strata', network: 'Mastercard', annualFeeCents: 0 },
  { issuer: 'Citi', name: 'AAdvantage MileUp', network: 'Mastercard', annualFeeCents: 0 },
  { issuer: 'Capital One', name: 'VentureOne', network: 'Visa', annualFeeCents: 0 },
  { issuer: 'Capital One', name: 'Quicksilver', network: 'Mastercard', annualFeeCents: 0 },
  { issuer: 'Barclays', name: 'JetBlue', network: 'Mastercard', annualFeeCents: 0 },
  { issuer: 'Bank of America', name: 'Customized Cash Rewards', network: 'Visa', annualFeeCents: 0 }
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

/**
 * Flag Amex charge / hybrid pay-over-time products. These are exempt from
 * Amex's 5-credit-card limit and the 1-in-5 / 2-in-90 velocity rules, so the
 * recommendation engine needs to tell them apart from revolving credit cards.
 * Green/Gold/Platinum (all variants) and the flexible-limit business cards
 * (Business Gold/Platinum, Graphite, Plum) qualify; co-brands (Delta, Hilton,
 * Marriott) and Blue Cash are ordinary credit cards. Runs every boot so new
 * feed products get flagged too; idempotent.
 */
export function seedChargeCards(db: DB): number {
  const amex = db.select({ id: issuer.id }).from(issuer).where(eq(issuer.name, 'American Express')).get()
  if (!amex) return 0
  const CHARGE = ['green', 'gold', 'platinum', 'graphite', 'plum']
  const NOT_CHARGE = ['delta', 'hilton', 'marriott', 'bonvoy', 'blue cash', 'everyday']
  const products = db
    .select({ id: cardProduct.id, name: cardProduct.name, isCharge: cardProduct.isCharge })
    .from(cardProduct)
    .where(eq(cardProduct.issuerId, amex.id))
    .all()
  let flagged = 0
  for (const p of products) {
    const n = p.name.toLowerCase()
    const shouldFlag = CHARGE.some((t) => n.includes(t)) && !NOT_CHARGE.some((t) => n.includes(t))
    if (shouldFlag && !p.isCharge) {
      db.update(cardProduct).set({ isCharge: true }).where(eq(cardProduct.id, p.id)).run()
      flagged++
    }
  }
  return flagged
}
