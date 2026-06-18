import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { pointProgram } from '../../db/schema'
import { POINT_PROGRAM_KINDS } from '@shared/constants'

const upsert = z.object({
  name: z.string().min(1, 'Name is required'),
  ownerPersonId: z.number().int().nullish(),
  kind: z.enum(POINT_PROGRAM_KINDS).nullish(),
  valuationCpp: z.number().nonnegative().nullish(),
  balance: z.number().int().nullish(),
  balanceUpdated: z.string().nullish(),
  nextExpiration: z.string().nullish(),
  notes: z.string().nullish()
})

export const pointsRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.query.pointProgram
      .findMany({ with: { owner: true }, orderBy: asc(pointProgram.name) })
      .sync()
  ),

  /** { id, label, valuationCpp } for bonus dropdowns. */
  listForSelect: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.pointProgram.findMany({ with: { owner: true } }).sync()
    return rows
      .map((p) => ({
        id: p.id,
        label: p.owner ? `${p.name} (${p.owner.name})` : p.name,
        valuationCpp: p.valuationCpp
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(pointProgram).values(input).returning().get()
  ),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(pointProgram)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(pointProgram.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(pointProgram).where(eq(pointProgram.id, input.id)).run()
      return { id: input.id }
    })
})
