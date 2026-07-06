import { router, publicProcedure } from '../trpc'
import { signupBonus, referral, benefit } from '../../db/schema'
import { buildReport } from '../../domain/report'

export const reportsRouter = router({
  /** Monthly spend + return series with overall totals (see domain/report.ts). */
  overview: publicProcedure.query(({ ctx }) => {
    const spendEntries = ctx.db.query.spendEntry
      .findMany({ with: { bonus: { with: { card: { with: { product: true } } } } } })
      .sync()
      .map((e) => ({
        amountCents: e.amountCents,
        date: e.date,
        cashbackPct: e.bonus?.card?.product?.defaultCashbackPct ?? null
      }))
    const bonuses = ctx.db.query.signupBonus
      .findMany({ with: { pointProgram: true } })
      .sync()
      .map((b) => ({
        received: b.received,
        receivedDate: b.receivedDate,
        cashAmountCents: b.cashAmountCents,
        pointsAmount: b.pointsAmount,
        valuationCpp: b.pointProgram?.valuationCpp ?? null
      }))
    const referrals = ctx.db
      .select({
        status: referral.status,
        date: referral.date,
        rewardValueCents: referral.rewardValueCents
      })
      .from(referral)
      .all()
    const benefits = ctx.db
      .select({
        used: benefit.used,
        usedDate: benefit.usedDate,
        amountCents: benefit.amountCents,
        usedAmountCents: benefit.usedAmountCents,
        valuePct: benefit.valuePct
      })
      .from(benefit)
      .all()

    return buildReport({ spendEntries, bonuses, referrals, benefits })
  })
})
