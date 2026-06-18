import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { signupBonus } from '../../db/schema'
import { REWARD_KINDS } from '@shared/constants'
import { computeBonus } from '../../domain/bonus'

const upsert = z.object({
  cardId: z.number().int(),
  targetSpendCents: z.number().int().nullish(),
  startDate: z.string().nullish(),
  deadline: z.string().nullish(),
  spendSoFarCents: z.number().int().default(0),
  rewardKind: z.enum(REWARD_KINDS).nullish(),
  pointProgramId: z.number().int().nullish(),
  pointsAmount: z.number().int().nullish(),
  cashAmountCents: z.number().int().nullish(),
  referralBonus: z.string().nullish(),
  received: z.boolean().default(false),
  amountUsedCents: z.number().int().nullish(),
  notes: z.string().nullish()
})

const withRelations = {
  pointProgram: true,
  card: { with: { product: { with: { issuer: true } }, owner: true } }
} as const

function enrich<
  T extends {
    pointProgram?: { valuationCpp: number | null } | null
    cashAmountCents: number | null
    pointsAmount: number | null
    targetSpendCents: number | null
    spendSoFarCents: number
  }
>(b: T): T & ReturnType<typeof computeBonus> {
  return { ...b, ...computeBonus(b, b.pointProgram?.valuationCpp) }
}

export const bonusesRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.signupBonus
      .findMany({ with: withRelations, orderBy: desc(signupBonus.deadline) })
      .sync()
    return rows.map(enrich)
  }),

  listByCard: publicProcedure
    .input(z.object({ cardId: z.number().int() }))
    .query(({ ctx, input }) => {
      const rows = ctx.db.query.signupBonus
        .findMany({ where: eq(signupBonus.cardId, input.cardId), with: withRelations })
        .sync()
      return rows.map(enrich)
    }),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(signupBonus).values(input).returning().get()
  ),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(signupBonus)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(signupBonus.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(signupBonus).where(eq(signupBonus.id, input.id)).run()
      return { id: input.id }
    })
})
