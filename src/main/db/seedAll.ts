import { sql } from 'drizzle-orm'
import type { DbLike } from './index'
import { seedIssuers } from './issuers'
import { seedPointPrograms } from './points'
import { seedExtraProducts } from './products'
import { seedCashbackRates, seedBureauReporting, seedReferralValues } from './cashback'
import { generateUpcomingBenefits } from './generateBenefits'
import { seedDefaultRules, seedRuleAdditions } from './rules'
import { seedReferralLinks } from './referralLinks'
import { dedupeCatalog } from './dedupe'
import { importOffersCsv } from '../import/offers'
import { productOffer } from './schema'

export interface SeedResources {
  /** Bundled signup-bonus offers snapshot (data/signup_bonuses.csv); null skips. */
  offersCsv: string | null
  /** Default recommendation rules (data/default_rules.json); null skips. */
  defaultRulesJson: string | null
}

/**
 * Everything that runs after migrations on every boot — catalog seeds,
 * cleanups, and recurring-benefit generation. Platform-neutral: resources
 * arrive as strings, so Electron reads them from disk and the web build
 * bundles them.
 */
export function seedAll(db: DbLike, resources: SeedResources): void {
  const seeded = seedIssuers(db)
  if (seeded.issuers) console.log(`[db] seeded ${seeded.issuers} issuers`)
  seedPointPrograms(db)
  const offerCount = db.select({ n: sql<number>`count(*)` }).from(productOffer).get()?.n ?? 0
  if (offerCount === 0 && resources.offersCsv) {
    try {
      const res = importOffersCsv(db, resources.offersCsv)
      console.log(`[db] seeded ${res.total} available offers from bundled CSV`)
    } catch (err) {
      console.warn('[db] could not seed offers:', err)
    }
  }
  seedExtraProducts(db)
  const cleaned = dedupeCatalog(db)
  if (cleaned.renamed || cleaned.merged) {
    console.log(`[db] catalog cleanup: ${cleaned.renamed} renamed, ${cleaned.merged} merged`)
  }
  const rated = seedCashbackRates(db)
  if (rated) console.log(`[db] filled baseline earn rates for ${rated} products`)
  const flagged = seedBureauReporting(db)
  if (flagged) console.log(`[db] flagged ${flagged} business products as personal-reporting`)
  const referrals = seedReferralValues(db)
  if (referrals) console.log(`[db] filled typical referral values on ${referrals} offers`)
  const seededRules = seedDefaultRules(db, resources.defaultRulesJson)
  if (seededRules) console.log(`[db] seeded ${seededRules} default recommendation rules`)
  const addedRules = seedRuleAdditions(db)
  if (addedRules) console.log(`[db] seeded ${addedRules} new recommendation rules`)
  const seededLinks = seedReferralLinks(db)
  if (seededLinks) console.log(`[db] seeded ${seededLinks} referral links`)
  const gen = generateUpcomingBenefits(db)
  if (gen.created || gen.dated) {
    console.log(`[db] recurring benefits: ${gen.created} generated, ${gen.dated} windows seeded`)
  }
}
