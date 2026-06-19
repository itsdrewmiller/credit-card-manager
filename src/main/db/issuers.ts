import { eq, sql } from 'drizzle-orm'
import type { DB } from './index'
import { issuer, issuerAlias } from './schema'

/**
 * Issuers + the name variants ("aliases") they appear as on a credit report.
 * This is the matching metadata for the importer. Card *products* are no longer
 * seeded here — they come from the bundled signup-bonus CSV and from imports
 * (a single source of truth, so no duplicate products).
 */
export interface SeedIssuer {
  name: string
  aliases: string[]
}

export const ISSUERS: SeedIssuer[] = [
  { name: 'Chase', aliases: ['CHASE', 'CHASE CARD', 'JPMCB', 'JPMCB CARD', 'CHASE BANK'] },
  { name: 'American Express', aliases: ['AMEX', 'AMERICAN EXPRESS', 'AMEX CARD', 'AMERICAN EXPRESS CO'] },
  { name: 'Capital One', aliases: ['CAPITAL ONE', 'CAPITAL ONE BANK', 'CAP ONE', 'CAPITAL ONE N.A.'] },
  { name: 'Citi', aliases: ['CITI', 'CITICARDS', 'CITIBANK', 'CITICARDS CBNA', 'CBNA'] },
  { name: 'Bank of America', aliases: ['BANK OF AMERICA', 'BANK OF AMERICA N.A.', 'BOFA', 'BK OF AMER'] },
  { name: 'Wells Fargo', aliases: ['WELLS FARGO', 'WELLS FARGO BANK', 'WF', 'WELLS FARGO CARD'] },
  { name: 'U.S. Bank', aliases: ['US BANK', 'U.S. BANK', 'USBANK', 'US BANK N.A.'] },
  { name: 'Barclays', aliases: ['BARCLAYS', 'BARCLAYS BANK DELAWARE', 'BARCLAY'] },
  { name: 'Discover', aliases: ['DISCOVER', 'DISCOVER BANK', 'DISCOVER FINANCIAL'] },
  { name: 'Elan', aliases: ['ELAN', 'ELAN FINANCIAL', 'ELAN FINANCIAL SERVICE'] }
]

/**
 * Idempotently seed issuers + their aliases. Safe on every startup: issuers are
 * found-or-created by name and only missing aliases are added (so existing
 * installs get aliases populated without duplicates).
 */
export function seedIssuers(db: DB): { issuers: number; aliases: number } {
  let issuers = 0
  let aliases = 0
  for (const iss of ISSUERS) {
    const found = db
      .select({ id: issuer.id })
      .from(issuer)
      .where(sql`lower(${issuer.name}) = ${iss.name.toLowerCase()}`)
      .get()
    const issuerId = found
      ? found.id
      : (() => {
          issuers++
          return db.insert(issuer).values({ name: iss.name }).returning({ id: issuer.id }).get().id
        })()

    const have = new Set(
      db
        .select({ a: issuerAlias.aliasText })
        .from(issuerAlias)
        .where(eq(issuerAlias.issuerId, issuerId))
        .all()
        .map((x) => x.a.toUpperCase())
    )
    for (const a of iss.aliases) {
      if (have.has(a.toUpperCase())) continue
      db.insert(issuerAlias).values({ issuerId, aliasText: a.toUpperCase() }).run()
      aliases++
    }
  }
  return { issuers, aliases }
}
