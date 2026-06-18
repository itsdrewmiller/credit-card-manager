import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { productOffer } from '../../db/schema'
import { REWARD_KINDS } from '@shared/constants'
import { bonusValueCents } from '@shared/format'

const upsert = z.object({
  cardProductId: z.number().int(),
  rewardKind: z.enum(REWARD_KINDS).nullish(),
  pointProgramId: z.number().int().nullish(),
  pointsAmount: z.number().int().nullish(),
  cashAmountCents: z.number().int().nullish(),
  minSpendCents: z.number().int().nullish(),
  windowMonths: z.number().int().nullish(),
  expires: z.string().nullish(),
  notes: z.string().nullish()
})

const withRelations = {
  product: { with: { issuer: true } },
  pointProgram: true
} as const

/** Add the computed cash value (cash, or points × the program's valuation). */
function enrich<
  T extends {
    cashAmountCents: number | null
    pointsAmount: number | null
    pointProgram?: { valuationCpp: number | null } | null
  }
>(o: T): T & { valueCents: number | null } {
  return {
    ...o,
    valueCents: bonusValueCents({
      cashAmountCents: o.cashAmountCents,
      pointsAmount: o.pointsAmount,
      valuationCpp: o.pointProgram?.valuationCpp
    })
  }
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
    })
})
