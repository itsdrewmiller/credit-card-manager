import { and, eq } from 'drizzle-orm'
import type { DbLike } from './index'
import { referralLink, cardProduct, issuer } from './schema'
import { getSetting, setSetting } from './settings'

/**
 * Referral links that ship with the app (source 'seeded'). Applying through
 * one supports the app author — the UI says so wherever a seeded link is
 * offered, so users know the difference between helping the developer and
 * storing their own link to earn the referral themselves.
 *
 * Each entry seeds at most once (tracked per key in app_setting), so a user
 * who deletes a seeded link doesn't find it re-added on the next boot.
 */
const SEEDED_LINKS: { key: string; issuer: string; product: string; url: string }[] = [
  {
    key: 'referral_link_seed.amex_business_platinum.v1',
    issuer: 'American Express',
    product: 'Business Platinum',
    url: 'https://americanexpress.com/en-us/referral/business-platinum-charge-card?ref=ANDREMczbj&xl=cp01'
  },
  {
    key: 'referral_link_seed.amex_business_gold.v1',
    issuer: 'American Express',
    product: 'Business Gold',
    url: 'https://americanexpress.com/en-us/referral/businessgold-card?ref=ANDREMk3R0&xl=cp01'
  },
  {
    key: 'referral_link_seed.amex_blue_business_plus.v1',
    issuer: 'American Express',
    product: 'Blue Business Plus',
    url: 'https://americanexpress.com/en-us/referral/bluebusinessplus-credit-card?ref=KATHLSOsfj&xl=cp01'
  },
  {
    key: 'referral_link_seed.amex_blue_cash_everyday.v1',
    issuer: 'American Express',
    product: 'Blue Cash Everyday',
    url: 'https://americanexpress.com/en-us/referral/blue-cash-everyday-credit-card?ref=KATHLSqdSw&xl=cp01'
  },
  // One Chase business link covers the whole Ink family plus SRB.
  ...['Ink Unlimited', 'Ink Cash', 'Ink Preferred', 'Ink Premier', 'Sapphire Reserve for Business'].map(
    (product) => ({
      key: `referral_link_seed.chase_${product.toLowerCase().replace(/\s+/g, '_')}.v1`,
      issuer: 'Chase',
      product,
      url: 'https://www.referyourchasecard.com/21g/CXUC3T5YGD'
    })
  ),
  {
    key: 'referral_link_seed.chase_sapphire_preferred.v1',
    issuer: 'Chase',
    product: 'Sapphire Preferred',
    url: 'https://www.referyourchasecard.com/19x/UTHL5AFO7A'
  },
  {
    key: 'referral_link_seed.chase_sapphire_reserve.v1',
    issuer: 'Chase',
    product: 'Sapphire Reserve',
    url: 'https://www.referyourchasecard.com/19x/UTHL5AFO7A#reserve'
  },
  // One link for the personal United family. Gateway and Club aren't in the
  // catalog yet — those seeds stay pending until the products exist.
  ...['United Gateway', 'United Explorer', 'United Quest', 'United Club'].map((product) => ({
    key: `referral_link_seed.chase_${product.toLowerCase().replace(/\s+/g, '_')}.v1`,
    issuer: 'Chase',
    product,
    url: 'https://www.referyourchasecard.com/215s/Q6ZKOVEEPQ'
  })),
  {
    key: 'referral_link_seed.chase_freedom_flex.v1',
    issuer: 'Chase',
    product: 'Freedom Flex',
    url: 'https://www.referyourchasecard.com/18a/25VGC63XSD#flex-content'
  },
  {
    key: 'referral_link_seed.chase_freedom_unlimited.v1',
    issuer: 'Chase',
    product: 'Freedom Unlimited',
    url: 'https://www.referyourchasecard.com/18a/25VGC63XSD#unlimited-content'
  }
]

export function seedReferralLinks(db: DbLike): number {
  let created = 0
  for (const seed of SEEDED_LINKS) {
    if (getSetting(db, seed.key) != null) continue
    const product = db
      .select({ id: cardProduct.id })
      .from(cardProduct)
      .innerJoin(issuer, eq(cardProduct.issuerId, issuer.id))
      .where(and(eq(cardProduct.name, seed.product), eq(issuer.name, seed.issuer)))
      .get()
    if (!product) continue // catalog missing the product; retry next boot
    db.insert(referralLink)
      .values({ cardProductId: product.id, url: seed.url, source: 'seeded' })
      .run()
    setSetting(db, seed.key, '1')
    created++
  }
  return created
}
