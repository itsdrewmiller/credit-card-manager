import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { referral } from '../../db/schema'
import { REFERRAL_STATUSES } from '@shared/constants'

const upsert = z.object({
  fromPersonId: z.number().int(),
  toPersonId: z.number().int().nullish(),
  cardProductId: z.number().int().nullish(),
  link: z.string().nullish(),
  rewardAmount: z.string().nullish(),
  rewardKind: z.string().nullish(),
  date: z.string().nullish(),
  status: z.enum(REFERRAL_STATUSES).nullish(),
  notes: z.string().nullish()
})

const withRelations = {
  from: true,
  to: true,
  product: { with: { issuer: true } }
} as const

export const referralsRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.query.referral
      .findMany({ with: withRelations, orderBy: desc(referral.date) })
      .sync()
  ),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(referral).values(input).returning().get()
  ),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(referral)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(referral.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(referral).where(eq(referral.id, input.id)).run()
      return { id: input.id }
    })
})
