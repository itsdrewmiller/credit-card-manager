import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { productBenefit } from '../../db/schema'
import { BENEFIT_PERIODS } from '@shared/constants'

const upsert = z.object({
  cardProductId: z.number().int(),
  name: z.string().min(1, 'Name is required'),
  category: z.string().nullish(),
  amountCents: z.number().int().nullish(),
  period: z.enum(BENEFIT_PERIODS).nullish(),
  notes: z.string().nullish()
})

const withRelations = { product: { with: { issuer: true } } } as const

export const productBenefitsRouter = router({
  /** Benefit templates attached to card products. */
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.query.productBenefit
      .findMany({ with: withRelations, orderBy: asc(productBenefit.name) })
      .sync()
  ),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(productBenefit).values(input).returning().get()
  ),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(productBenefit)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(productBenefit.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(productBenefit).where(eq(productBenefit.id, input.id)).run()
      return { id: input.id }
    })
})
