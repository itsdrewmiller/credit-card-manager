import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import type { DbLike } from '../../db'
import { benefit } from '../../db/schema'
import { todayIso } from '@shared/dates'
import { BENEFIT_PERIODS } from '@shared/constants'
import { applyUsedStamp, benefitStatus, type UsedState } from '../../domain/benefit'

const upsert = z.object({
  cardId: z.number().int(),
  name: z.string().min(1, 'Name is required'),
  category: z.string().nullish(),
  amountCents: z.number().int().nullish(),
  valuePct: z.number().nullish(),
  period: z.enum(BENEFIT_PERIODS).nullish(),
  year: z.number().int().nullish(),
  useAfter: z.string().nullish(),
  useBy: z.string().nullish(),
  used: z.boolean().default(false),
  usedAmountCents: z.number().int().nullish(),
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
>(b: T): T & { status: ReturnType<typeof benefitStatus> } {
  return { ...b, status: benefitStatus(b) }
}

/** Current used-state of a row, for the shared stamping rule. */
function usedState(db: DbLike, id: number): UsedState {
  return (
    db
      .select({ used: benefit.used, usedDate: benefit.usedDate, usedAmountCents: benefit.usedAmountCents })
      .from(benefit)
      .where(eq(benefit.id, id))
      .get() ?? { used: false, usedDate: null, usedAmountCents: null }
  )
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
      const stamp = applyUsedStamp(usedState(ctx.db, id), rest, todayIso())
      return ctx.db
        .update(benefit)
        .set({ ...rest, ...stamp, updatedAt: Date.now() })
        .where(eq(benefit.id, id))
        .returning()
        .get()
    }),

  /** Quick toggle for the inline "used" checkbox. */
  setUsed: publicProcedure
    .input(z.object({ id: z.number().int(), used: z.boolean() }))
    .mutation(({ ctx, input }) => {
      const stamp = applyUsedStamp(usedState(ctx.db, input.id), { used: input.used }, todayIso())
      return ctx.db
        .update(benefit)
        .set({ ...stamp, updatedAt: Date.now() })
        .where(eq(benefit.id, input.id))
        .returning()
        .get()
    }),

  /** Inline partial-use entry: "$65 of the $150 credit". */
  setUsedAmount: publicProcedure
    .input(z.object({ id: z.number().int(), usedAmountCents: z.number().int().nullish() }))
    .mutation(({ ctx, input }) => {
      const stamp = applyUsedStamp(
        usedState(ctx.db, input.id),
        { usedAmountCents: input.usedAmountCents ?? null },
        todayIso()
      )
      return ctx.db
        .update(benefit)
        .set({ ...stamp, updatedAt: Date.now() })
        .where(eq(benefit.id, input.id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(benefit).where(eq(benefit.id, input.id)).run()
      return { id: input.id }
    })
})
