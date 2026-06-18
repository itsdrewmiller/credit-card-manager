import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { business } from '../../db/schema'

const upsert = z.object({
  name: z.string().min(1, 'Name is required'),
  ownerPersonId: z.number().int(),
  type: z.string().nullish(),
  notes: z.string().nullish()
})

export const businessesRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.query.business.findMany({
      with: { owner: true },
      orderBy: asc(business.name)
    }).sync()
  ),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(business).values(input).returning().get()
  ),

  update: publicProcedure
    .input(upsert.extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(business)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(business.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(business).where(eq(business.id, input.id)).run()
      return { id: input.id }
    })
})
