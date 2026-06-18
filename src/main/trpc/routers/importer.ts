import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import type { DB } from '../../db'
import { card, cardProduct, cardProductAlias, issuer } from '../../db/schema'
import { extractTextItems } from '../../import/pdf'
import { parseEquifaxAccounts } from '../../import/equifax'
import { buildIssuerMatcher, type AliasRow } from '../../import/match'

function aliasCorpus(db: DB): AliasRow[] {
  return db
    .select({
      issuerId: issuer.id,
      issuerName: issuer.name,
      aliasText: cardProductAlias.aliasText
    })
    .from(cardProductAlias)
    .innerJoin(cardProduct, eq(cardProductAlias.cardProductId, cardProduct.id))
    .innerJoin(issuer, eq(cardProduct.issuerId, issuer.id))
    .all()
}

const commitRow = z.object({
  creditorName: z.string(),
  accountType: z.string().nullish(),
  accountNumberMask: z.string().nullish(),
  last4: z.string().nullish(),
  issuerId: z.number().int().nullish(),
  cardProductId: z.number().int().nullish(),
  ownerPersonId: z.number().int().nullish(),
  network: z.string().nullish(),
  openedDate: z.string().nullish(),
  status: z.enum(['open', 'closed']).default('open'),
  responsibility: z.string().nullish()
})

export const importerRouter = router({
  /**
   * Parse an Equifax PDF (base64) and return tradelines annotated with a
   * suggested issuer match. No DB writes — this is a preview.
   */
  parseEquifax: publicProcedure
    .input(z.object({ base64: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const data = new Uint8Array(Buffer.from(input.base64, 'base64'))
      const items = await extractTextItems(data)
      const tradelines = parseEquifaxAccounts(items)
      const matcher = buildIssuerMatcher(aliasCorpus(ctx.db))

      const matched = tradelines.map((t) => {
        const m = t.creditorName ? matcher.match(t.creditorName) : null
        return {
          ...t,
          suggestedIssuerId: m?.issuerId ?? null,
          suggestedIssuerName: m?.issuerName ?? null,
          confidence: m?.confidence ?? null
        }
      })

      return {
        total: tradelines.length,
        creditCards: matched.filter((t) => t.isCreditCard).length,
        matched: matched.filter((t) => t.suggestedIssuerId != null).length,
        tradelines: matched
      }
    }),

  /** Create cards from confirmed tradelines. Every row becomes a card. */
  commit: publicProcedure
    .input(z.object({ ownerPersonId: z.number().int().nullish(), rows: z.array(commitRow) }))
    .mutation(({ ctx, input }) => {
      let created = 0
      ctx.db.transaction((tx) => {
        for (const r of input.rows) {
          tx.insert(card)
            .values({
              cardProductId: r.cardProductId ?? null,
              ownerPersonId: r.ownerPersonId ?? input.ownerPersonId ?? null,
              rawCreditorName: r.creditorName,
              rawAccountLabel: r.accountType ?? null,
              last4: r.last4 ?? null, // Equifax exposes the last 4
              network: r.network ?? null,
              status: r.status,
              responsibility: r.responsibility ?? null,
              openedDate: r.openedDate ?? null,
              source: 'imported'
            })
            .run()
          created++
        }
      })
      return { created }
    })
})
