import { and, eq, inArray, sql } from 'drizzle-orm'
import type { DbLike } from './index'
import { cardProduct, issuer } from './schema'

/**
 * Baseline (non-category) earn rates by product, as a cash-back percent.
 *
 * Conventions:
 * - Cash-back cards use their literal base percentage.
 * - Points/miles cards use the base multiplier valued at 1¢/point (fair for
 *   transferable and airline currencies).
 * - Hotel currencies are valued at standard cpp (Hilton/IHG ≈ 0.5¢,
 *   Marriott ≈ 0.7¢, Hyatt ≈ 1.7¢, Choice ≈ 0.6¢) since their multipliers
 *   overstate value at 1¢.
 * - Multi-tier cards use the base tier (e.g. Alliant without Tier One
 *   checking, Apple Card's non-Apple-Pay rate).
 *
 * Applied only where default_cashback_pct is NULL, so inline edits stick.
 * Keyed "issuer|product", both as they appear in the seeded catalog.
 */
const RATES: Record<string, number> = {
  'Alliant Credit Union|Cashback Visa Signature': 1.5,
  'American Express|Blue Business Plus': 2,
  'American Express|Blue Cash Everyday': 1,
  'American Express|Blue Cash Preferred': 1,
  'American Express|Business Gold': 1,
  'American Express|Business Platinum': 1,
  'American Express|Delta Gold': 1,
  'American Express|Delta SkyMiles Gold': 1,
  'American Express|Delta SkyMiles Gold Business': 1,
  'American Express|Delta SkyMiles Platinum': 1,
  'American Express|Delta SkyMiles Platinum Business': 1,
  'American Express|Delta SkyMiles Reserve': 1,
  'American Express|Delta SkyMiles Reserve Business': 1,
  'American Express|Everyday Preferred': 1,
  'American Express|Gold': 1,
  'American Express|Gold Card': 1,
  'American Express|Graphite': 1,
  'American Express|Green Card': 1,
  'American Express|Hilton Aspire': 1.5,
  'American Express|Hilton Honors Surpass': 1.5,
  'American Express|Marriott Bonvoy Bevy': 1.4,
  'American Express|Marriott Bonvoy Brilliant': 1.4,
  'American Express|Marriott Bonvoy Business': 1.4,
  'American Express|Platinum': 1,
  'American Express|Platinum Card': 1,
  'American Express|Platinum for Morgan Stanley': 1,
  'American Express|Platinum for Schwab': 1,
  'Bank of America|Air France KLM': 1,
  'Bank of America|Alaska Atmos Ascent': 1,
  'Bank of America|Alaska Atmos Business': 1,
  'Bank of America|Alaska Atmos Summit': 1,
  'Bank of America|Business Advantage Customized Cash': 1,
  'Bank of America|Business Advantage Unlimited Cash': 1.5,
  'Bank of America|Customized Cash Rewards': 1,
  'Bank of America|Personal Unlimited Cash Rewards': 1.5,
  'Bank of America|Premium Rewards': 1.5,
  'Bank of America|Premium Rewards Elite': 1.5,
  'Bank of America|Travel Rewards': 1.5,
  'Barclays|AAdvantage Aviator Red': 1,
  'Barclays|JetBlue Business': 1,
  'Barclays|JetBlue Plus': 1,
  'Barclays|Priceline': 1,
  'Barclays|Upromise': 1.25,
  'Barclays|Wyndham Earner Plus': 1,
  'Barclays|Wyndham Earner Premier': 1,
  'Capital One|Quicksilver': 1.5,
  'Capital One|Savor': 1,
  'Capital One|Savor Rewards': 1,
  'Capital One|Spark Cash': 2,
  'Capital One|Spark Cash Plus': 2,
  'Capital One|Spark Cash Select': 1.5,
  'Capital One|Venture': 2,
  'Capital One|Venture Business': 2,
  'Capital One|Venture Rewards': 2,
  'Capital One|Venture X': 2,
  'Capital One|Venture X Business': 2,
  'Capital One|VentureOne': 1.25,
  'Capital One|VentureOne Business': 1.25,
  'Chase|Aer Lingus': 1,
  'Chase|Aeroplan': 1,
  'Chase|British Airways': 1,
  'Chase|Freedom Flex': 1,
  'Chase|Freedom Unlimited': 1.5,
  'Chase|IHG One Rewards Premier': 1.5,
  'Chase|IHG Premier': 1.5,
  'Chase|IHG Traveler': 1,
  'Chase|Iberia': 1,
  'Chase|Ink Cash': 1,
  'Chase|Ink Preferred': 1,
  'Chase|Ink Premier': 2,
  'Chase|Ink Unlimited': 1.5,
  'Chase|Marriott Bonvoy Boundless': 1.4,
  'Chase|Sapphire Preferred': 1,
  'Chase|Sapphire Reserve': 1,
  'Chase|Sapphire Reserve for Business': 1,
  'Chase|Southwest Airlines Performance Business': 1,
  'Chase|Southwest Airlines Plus': 1,
  'Chase|Southwest Airlines Premier': 1,
  'Chase|Southwest Airlines Premier Business': 1,
  'Chase|Southwest Airlines Priority': 1,
  'Chase|United Business': 1,
  'Chase|United Club Business': 1,
  'Chase|United Explorer': 1,
  'Chase|United Quest': 1,
  'Chase|World of Hyatt Business': 1.7,
  'Citi|AAdvantage Business': 1,
  'Citi|AAdvantage Executive': 1,
  'Citi|AAdvantage Globe': 1,
  'Citi|AAdvantage Platinum Select': 1,
  'Citi|AT&T Points Plus': 1,
  'Citi|CitiBusiness AAdvantage Platinum Select': 1,
  'Citi|Custom Cash': 1,
  'Citi|Double Cash': 2,
  'Citi|Strata Elite': 1,
  'Citi|Strata Premier': 1,
  'Discover|it': 1,
  'Discover|it Cash Back': 1,
  'Elan|Fidelity Rewards': 2,
  'Fidelity|2% Card': 2,
  'Goldman Sachs|Apple Card': 1,
  'PenFed|Pathfinder Rewards': 1.5,
  'Synchrony|Amazon Store Card': 5,
  'Synchrony|Virgin Red Rewards': 1,
  'TD Bank|Target Circle Card': 5,
  'U.S. Bank|Altitude Connect': 1,
  'U.S. Bank|Altitude Reserve': 1,
  'U.S. Bank|Amazon Prime Business': 5,
  'U.S. Bank|Business Altitude Connect': 1,
  'U.S. Bank|Business Leverage': 1,
  'U.S. Bank|Cash+': 1,
  'U.S. Bank|Shopper Cash Rewards': 1.5,
  'U.S. Bank|Smartly': 2,
  'U.S. Bank|Triple Cash Business': 1,
  'Wells Fargo|Active Cash': 2,
  'Wells Fargo|Autograph': 1,
  'Wells Fargo|Autograph Journey': 1,
  'Wells Fargo|Expedia One Key': 1.5,
  'Wells Fargo|Premier Autograph': 1,
  'Wells Fargo|Signify Business': 2
}

const lookup = new Map(
  Object.entries(RATES).map(([k, v]) => [k.toLowerCase(), v] as const)
)

/** Issuers whose business cards report to the personal bureaus and therefore
 *  count toward 5/24. Applied by rule so newly imported products get flagged. */
const PERSONAL_REPORTING_ISSUERS = ['Capital One', 'Discover', 'TD Bank']

/** Flag business products from personal-reporting issuers. Idempotent. */
export function seedBureauReporting(db: DbLike): number {
  const rows = db
    .select({ id: cardProduct.id })
    .from(cardProduct)
    .innerJoin(issuer, eq(issuer.id, cardProduct.issuerId))
    .where(
      and(
        eq(cardProduct.isBusiness, true),
        eq(cardProduct.reportsToPersonal, false),
        inArray(issuer.name, PERSONAL_REPORTING_ISSUERS)
      )
    )
    .all()
  for (const p of rows) {
    db.update(cardProduct)
      .set({ reportsToPersonal: true })
      .where(eq(cardProduct.id, p.id))
      .run()
  }
  return rows.length
}

/** Fill known baseline earn rates where none is set. Idempotent; never
 *  overwrites a rate (seeded or user-edited). Returns how many were filled. */
export function seedCashbackRates(db: DbLike): number {
  const rows = db
    .select({ id: cardProduct.id, name: cardProduct.name, issuerName: issuer.name })
    .from(cardProduct)
    .innerJoin(issuer, sql`${issuer.id} = ${cardProduct.issuerId}`)
    .where(sql`${cardProduct.defaultCashbackPct} is null`)
    .all()

  let filled = 0
  for (const p of rows) {
    const pct = lookup.get(`${p.issuerName}|${p.name}`.toLowerCase())
    if (pct == null) continue
    db.update(cardProduct)
      .set({ defaultCashbackPct: pct })
      .where(sql`${cardProduct.id} = ${p.id}`)
      .run()
    filled++
  }
  return filled
}
