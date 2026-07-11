import { z } from 'zod'
import { eq, asc, sql } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import type { DbLike } from '../../db'
import { signupBonus, spendEntry } from '../../db/schema'
import { REWARD_KINDS } from '@shared/constants'
import { todayIso } from '@shared/dates'
import { computeBonus } from '../../domain/bonus'

const today = (): string => todayIso()

/** Every change to spendSoFarCents flows through a dated ledger entry. */
function recordSpendDelta(db: DbLike, bonusId: number, deltaCents: number, date: string): void {
  if (deltaCents === 0) return
  db.insert(spendEntry).values({ bonusId, amountCents: deltaCents, date }).run()
}

const upsert = z.object({
  cardId: z.number().int(),
  targetSpendCents: z.number().int().nullish(),
  deadline: z.string().nullish(),
  spendSoFarCents: z.number().int().default(0),
  rewardKind: z.enum(REWARD_KINDS).nullish(),
  pointProgramId: z.number().int().nullish(),
  pointsAmount: z.number().int().nullish(),
  cashAmountCents: z.number().int().nullish(),
  referralBonus: z.string().nullish(),
  received: z.boolean().default(false),
  receivedDate: z.string().nullish(),
  notes: z.string().nullish()
})

const withRelations = {
  pointProgram: true,
  card: { with: { product: { with: { issuer: true } }, owner: true } }
} as const

function enrich<
  T extends {
    pointProgram?: { valuationCpp: number | null } | null
    card?: { openedDate: string | null } | null
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
      // Soonest deadline first; bonuses without one sink to the bottom.
      .findMany({
        with: withRelations,
        orderBy: [sql`${signupBonus.deadline} is null`, asc(signupBonus.deadline)]
      })
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
    ctx.db.transaction((tx) => {
      const values = { ...input }
      if (values.received && values.receivedDate == null) values.receivedDate = today()
      const created = tx.insert(signupBonus).values(values).returning().get()
      // Spend is dated by when it was recorded, not by the bonus window.
      recordSpendDelta(tx, created.id, created.spendSoFarCents, today())
      return created
    })
  ),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db.transaction((tx) => {
        const current = tx
          .select({ spendSoFarCents: signupBonus.spendSoFarCents, received: signupBonus.received })
          .from(signupBonus)
          .where(eq(signupBonus.id, id))
          .get()
        if (!current) throw new Error(`Bonus ${id} not found`)

        const values: typeof rest = { ...rest }
        // Stamp/clear receivedDate as received flips, unless caller set one.
        if (values.received === true && !current.received && values.receivedDate == null) {
          values.receivedDate = today()
        }
        if (values.received === false) values.receivedDate = values.receivedDate ?? null

        const updated = tx
          .update(signupBonus)
          .set({ ...values, updatedAt: Date.now() })
          .where(eq(signupBonus.id, id))
          .returning()
          .get()
        if (values.spendSoFarCents != null) {
          recordSpendDelta(tx, id, values.spendSoFarCents - current.spendSoFarCents, today())
        }
        return updated
      })
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(signupBonus).where(eq(signupBonus.id, input.id)).run()
      return { id: input.id }
    })
})
