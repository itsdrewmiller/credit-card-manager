import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { benefit } from '../../db/schema'
import { toIsoDate } from '@shared/format'
import { BENEFIT_PERIODS } from '@shared/constants'
import { computeBenefit } from '../../domain/benefit'

const upsert = z.object({
  cardId: z.number().int(),
  name: z.string().min(1, 'Name is required'),
  category: z.string().nullish(),
  amountCents: z.number().int().nullish(),
  period: z.enum(BENEFIT_PERIODS).nullish(),
  year: z.number().int().nullish(),
  useAfter: z.string().nullish(),
  useBy: z.string().nullish(),
  used: z.boolean().default(false),
  usedDate: z.string().nullish(),
  confirmed: z.boolean().default(false),
  isSubscription: z.boolean().default(false),
  notes: z.string().nullish()
})

const withRelations = {
  card: { with: { product: { with: { issuer: true } }, owner: true } }
} as const

function enrich<
  T extends { useAfter: string | null; useBy: string | null; used: boolean }
>(b: T): T & ReturnType<typeof computeBenefit> {
  return { ...b, ...computeBenefit(b) }
}

export const benefitsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.benefit
      .findMany({ with: withRelations, orderBy: asc(benefit.useBy) })
      .sync()
    return rows.map(enrich)
  }),

  listByCard: publicProcedure
    .input(z.object({ cardId: z.number().int() }))
    .query(({ ctx, input }) => {
      const rows = ctx.db.query.benefit
        .findMany({ where: eq(benefit.cardId, input.cardId), with: withRelations })
        .sync()
      return rows.map(enrich)
    }),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(benefit).values(input).returning().get()
  ),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      const values: typeof rest = { ...rest }
      // Stamp/clear usedDate as used flips (drives the return timeline).
      if (values.used === true && values.usedDate == null) {
        const current = ctx.db
          .select({ used: benefit.used })
          .from(benefit)
          .where(eq(benefit.id, id))
          .get()
        if (!current?.used) values.usedDate = toIsoDate(new Date())
      }
      if (values.used === false) values.usedDate = values.usedDate ?? null
      return ctx.db
        .update(benefit)
        .set({ ...values, updatedAt: Date.now() })
        .where(eq(benefit.id, id))
        .returning()
        .get()
    }),

  /** Quick toggle for the inline "used" checkbox. */
  setUsed: publicProcedure
    .input(z.object({ id: z.number().int(), used: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.db
        .update(benefit)
        .set({
          used: input.used,
          usedDate: input.used ? toIsoDate(new Date()) : null,
          updatedAt: Date.now()
        })
        .where(eq(benefit.id, input.id))
        .returning()
        .get()
    ),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(benefit).where(eq(benefit.id, input.id)).run()
      return { id: input.id }
    })
})
