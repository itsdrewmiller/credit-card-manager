import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { recurringPayment } from '../../db/schema'
import { RECURRING_PERIODS } from '@shared/constants'
import { cardSpendStatus, type CardSpendStatus } from '../../domain/recurring'

const upsert = z.object({
  name: z.string().min(1, 'Name is required'),
  cardId: z.number().int().nullish(),
  amountCents: z.number().int().nullish(),
  period: z.enum(RECURRING_PERIODS).nullish(),
  notes: z.string().nullish()
})

const withRelations = {
  card: { with: { product: { with: { issuer: true } }, owner: true, bonuses: true } }
} as const

export const recurringPaymentsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.recurringPayment
      .findMany({ with: withRelations, orderBy: asc(recurringPayment.name) })
      .sync()
    // Derive whether the assigned card is still earning a bonus; null when unassigned.
    return rows.map((r) => ({
      ...r,
      cardStatus: (r.card ? cardSpendStatus(r.card.bonuses) : null) as CardSpendStatus | null
    }))
  }),

  create: publicProcedure
    .input(upsert)
    .mutation(({ ctx, input }) => ctx.db.insert(recurringPayment).values(input).returning().get()),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(recurringPayment)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(recurringPayment.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(recurringPayment).where(eq(recurringPayment.id, input.id)).run()
      return { id: input.id }
    })
})
