import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { person } from '../../db/schema'

const upsert = z.object({
  name: z.string().min(1, 'Name is required'),
  notes: z.string().nullish()
})

export const peopleRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(person).orderBy(asc(person.name)).all()
  ),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(person).values(input).returning().get()
  ),

  update: publicProcedure
    .input(upsert.extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(person)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(person.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(person).where(eq(person.id, input.id)).run()
      return { id: input.id }
    })
})
