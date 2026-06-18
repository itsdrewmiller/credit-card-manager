import { sql } from 'drizzle-orm'
import type { DB } from './index'
import { issuer, cardProduct, cardProductAlias } from './schema'
import { CATALOG } from './catalog'

/**
 * Idempotently seed issuers + the starter product catalog + aliases.
 * Safe to run on every startup: skips entirely if any issuer already exists.
 */
export function seedCatalog(db: DB): { issuers: number; products: number; aliases: number } {
  const existing = db.select({ n: sql<number>`count(*)` }).from(issuer).all()
  if ((existing[0]?.n ?? 0) > 0) {
    return { issuers: 0, products: 0, aliases: 0 }
  }

  let issuers = 0
  let products = 0
  let aliases = 0

  db.transaction((tx) => {
    for (const iss of CATALOG) {
      const insertedIssuer = tx
        .insert(issuer)
        .values({ name: iss.name })
        .returning({ id: issuer.id })
        .get()
      issuers++

      for (const prod of iss.products) {
        const insertedProduct = tx
          .insert(cardProduct)
          .values({
            issuerId: insertedIssuer.id,
            name: prod.name,
            network: prod.network,
            isBusiness: prod.isBusiness ?? false,
            defaultAnnualFeeCents: prod.annualFeeCents
          })
          .returning({ id: cardProduct.id })
          .get()
        products++

        // Aliases: product-specific + inherited issuer-level names. The
        // issuer aliases help the importer match issuer-level report names.
        const aliasTexts = new Set<string>([
          prod.name.toUpperCase(),
          `${iss.name} ${prod.name}`.toUpperCase(),
          ...(prod.aliases ?? []).map((a) => a.toUpperCase()),
          ...iss.aliases.map((a) => a.toUpperCase())
        ])
        for (const aliasText of aliasTexts) {
          tx.insert(cardProductAlias).values({
            cardProductId: insertedProduct.id,
            aliasText
          }).run()
          aliases++
        }
      }
    }
  })

  return { issuers, products, aliases }
}
