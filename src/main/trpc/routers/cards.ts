import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { card } from '../../db/schema'
import { CARD_STATUSES } from '@shared/constants'
import { cardMissingFields } from '../../domain/needsInfo'

const upsert = z.object({
  cardProductId: z.number().int().nullish(),
  ownerPersonId: z.number().int().nullish(),
  businessId: z.number().int().nullish(),
  rawCreditorName: z.string().nullish(),
  rawAccountLabel: z.string().nullish(),
  network: z.string().nullish(),
  last4: z.string().nullish(),
  annualFeeCents: z.number().int().nullish(),
  status: z.enum(CARD_STATUSES).default('open'),
  responsibility: z.string().nullish(),
  appliedDate: z.string().nullish(),
  openedDate: z.string().nullish(),
  closedDate: z.string().nullish(),
  rejectedDate: z.string().nullish(),
  rejectionReason: z.string().nullish(),
  source: z.string().default('manual'),
  notes: z.string().nullish()
})

const withRelations = {
  product: { with: { issuer: true } },
  owner: true,
  business: true,
  bonuses: { with: { pointProgram: true } },
  benefits: true
} as const

/** Enriched card row with derived missing-field list. */
function enrich<T extends { status: string | null } & Record<string, unknown>>(
  c: T
): T & { missingFields: ReturnType<typeof cardMissingFields> } {
  return { ...c, missingFields: cardMissingFields(c) }
}

export const cardsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.card
      .findMany({ with: withRelations, orderBy: desc(card.openedDate) })
      .sync()
    return rows.map(enrich)
  }),

  get: publicProcedure.input(z.object({ id: z.number().int() })).query(({ ctx, input }) => {
    const row = ctx.db.query.card
      .findFirst({ where: eq(card.id, input.id), with: withRelations })
      .sync()
    return row ? enrich(row) : null
  }),

  /** Live cards (open/applied) missing churning-critical fields. */
  needsInfo: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.card.findMany({ with: withRelations }).sync()
    return rows.map(enrich).filter((c) => c.missingFields.length > 0)
  }),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(card).values(input).returning().get()
  ),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(card)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(card.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(card).where(eq(card.id, input.id)).run()
      return { id: input.id }
    })
})
