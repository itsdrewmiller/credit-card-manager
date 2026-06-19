import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { productOffer } from '../../db/schema'
import { REWARD_KINDS } from '@shared/constants'
import { importOffersCsv } from '../../import/offers'

const upsert = z.object({
  cardProductId: z.number().int(),
  rewardKind: z.enum(REWARD_KINDS).nullish(),
  currency: z.string().nullish(),
  pointProgramId: z.number().int().nullish(),
  pointsAmount: z.number().int().nullish(),
  cashAmountCents: z.number().int().nullish(),
  pointValueCpp: z.number().nullish(),
  minSpendCents: z.number().int().nullish(),
  windowMonths: z.number().int().nullish(),
  expires: z.string().nullish(),
  notes: z.string().nullish()
})

const withRelations = {
  product: { with: { issuer: true } },
  pointProgram: true
} as const

/** value = cash, else points × the offer's cpp (falling back to a linked program). */
function enrich<
  T extends {
    cashAmountCents: number | null
    pointsAmount: number | null
    pointValueCpp: number | null
    pointProgram?: { valuationCpp: number | null } | null
  }
>(o: T): T & { valueCents: number | null } {
  let valueCents: number | null = null
  if (o.cashAmountCents != null) valueCents = o.cashAmountCents
  else {
    const cpp = o.pointValueCpp ?? o.pointProgram?.valuationCpp ?? null
    if (o.pointsAmount != null && cpp != null) valueCents = Math.round(o.pointsAmount * cpp)
  }
  return { ...o, valueCents }
}

export const offersRouter = router({
  /** Available signup-bonus offers, by card product. */
  list: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.productOffer
      .findMany({ with: withRelations, orderBy: desc(productOffer.updatedAt) })
      .sync()
    return rows.map(enrich)
  }),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(productOffer).values(input).returning().get()
  ),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(productOffer)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(productOffer.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(productOffer).where(eq(productOffer.id, input.id)).run()
      return { id: input.id }
    }),

  /**
   * Import offers from the normalized signup-bonus CSV. Find-or-creates the
   * issuer and card product per row, then upserts one offer per product.
   */
  importCsv: publicProcedure
    .input(z.object({ text: z.string() }))
    .mutation(({ ctx, input }) => importOffersCsv(ctx.db, input.text))
})
