import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { referralLink } from '../../db/schema'

const upsert = z.object({
  cardProductId: z.number().int(),
  url: z.string().url('Must be a valid URL'),
  ownerPersonId: z.number().int().nullish(),
  ownerBusinessId: z.number().int().nullish(),
  notes: z.string().nullish()
})

const withRelations = {
  product: { with: { issuer: true } },
  ownerPerson: true,
  ownerBusiness: true
} as const

export const referralLinksRouter = router({
  /** Stored referral links per product — user-owned plus any seeded with the app. */
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.query.referralLink.findMany({ with: withRelations, orderBy: asc(referralLink.id) }).sync()
  ),

  // Created links are always user-owned; 'seeded' rows ship with the app.
  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(referralLink).values({ ...input, source: 'user' }).returning().get()
  ),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(referralLink)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(referralLink.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => {
    ctx.db.delete(referralLink).where(eq(referralLink.id, input.id)).run()
    return { id: input.id }
  })
})
