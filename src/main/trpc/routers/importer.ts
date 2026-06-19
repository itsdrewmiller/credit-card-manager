import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import type { DB } from '../../db'
import { card, issuer, issuerAlias } from '../../db/schema'
import { extractTextItems } from '../../import/pdf'
import { parseEquifaxAccounts } from '../../import/equifax'
import { buildIssuerMatcher, type AliasRow, type IssuerMatch } from '../../import/match'
import { findDuplicate, type DedupCard } from '../../import/dedup'
import { applyProductDefaults } from '../../domain/product'

/** Existing cards reduced to what dedup needs, with their issuer resolved. */
function existingDedupCards(db: DB, matcher: { match: (n: string) => IssuerMatch | null }): DedupCard[] {
  const rows = db.query.card.findMany({ with: { product: true } }).sync()
  return rows.map((c) => ({
    id: c.id,
    openedDate: c.openedDate,
    issuerId:
      c.issuerId ?? c.product?.issuerId ?? matcher.match(c.rawCreditorName ?? '')?.issuerId ?? null,
    name: c.rawCreditorName ?? c.product?.name ?? ''
  }))
}

function aliasCorpus(db: DB): AliasRow[] {
  return db
    .select({
      issuerId: issuer.id,
      issuerName: issuer.name,
      aliasText: issuerAlias.aliasText
    })
    .from(issuerAlias)
    .innerJoin(issuer, eq(issuerAlias.issuerId, issuer.id))
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
  closedDate: z.string().nullish(),
  status: z.enum(['open', 'closed']).default('open')
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
      const existing = existingDedupCards(ctx.db, matcher)

      const matched = tradelines.map((t) => {
        const m = t.creditorName ? matcher.match(t.creditorName) : null
        const issuerId = m?.issuerId ?? null
        const duplicateOfCardId = findDuplicate(
          { creditorName: t.creditorName, openedDate: t.openedDate, issuerId },
          existing
        )
        return {
          ...t,
          suggestedIssuerId: issuerId,
          suggestedIssuerName: m?.issuerName ?? null,
          confidence: m?.confidence ?? null,
          duplicate: duplicateOfCardId != null
        }
      })

      return {
        total: tradelines.length,
        creditCards: matched.filter((t) => t.isCreditCard).length,
        matched: matched.filter((t) => t.suggestedIssuerId != null).length,
        duplicates: matched.filter((t) => t.duplicate).length,
        tradelines: matched
      }
    }),

  /** Create cards from confirmed tradelines. Every row becomes a card. */
  commit: publicProcedure
    .input(z.object({ ownerPersonId: z.number().int().nullish(), rows: z.array(commitRow) }))
    .mutation(({ ctx, input }) => {
      let created = 0
      ctx.db.transaction((tx) => {
        const h = tx as unknown as DB
        for (const r of input.rows) {
          // When a product is matched, inherit its annual fee / network / issuer.
          const values = applyProductDefaults(h, {
            cardProductId: r.cardProductId ?? null,
            issuerId: r.issuerId ?? null,
            network: r.network ?? null,
            annualFeeCents: null
          })
          tx.insert(card)
            .values({
              ...values,
              ownerPersonId: r.ownerPersonId ?? input.ownerPersonId ?? null,
              rawCreditorName: r.creditorName,
              rawAccountLabel: r.accountType ?? null,
              last4: r.last4 ?? null, // Equifax exposes the last 4
              status: r.status,
              openedDate: r.openedDate ?? null,
              closedDate: r.closedDate ?? null,
              source: 'imported'
            })
            .run()
          created++
        }
      })
      return { created }
    })
})
