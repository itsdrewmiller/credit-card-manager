import { router, publicProcedure } from '../trpc'
import { signupBonus, referral, benefit, card } from '../../db/schema'
import { buildReport } from '../../domain/report'
import { todayIso, toIsoDate, daysUntil } from '@shared/dates'
import { computeBonus, isBonusOpen } from '../../domain/bonus'
import { nextFeeRenewal } from '../../domain/fees'
import { resolveMonthlySpendCents } from './recommendations'

/** Fees this far out still count as a "key date" — wider than the dashboard
 *  reminder lead so planning happens a season ahead. */
const KEY_DATE_FEE_DAYS = 120

export const reportsRouter = router({
  /**
   * The action-oriented dashboard view: open signup bonuses with deadlines
   * and pace, upcoming annual fees, and a projection of when all remaining
   * bonus min-spend completes at the current spend rate ("out of signup
   * bonus" — free for the next application).
   */
  keyDates: publicProcedure.query(({ ctx }) => {
    const today = todayIso()
    const rate = resolveMonthlySpendCents(ctx.db)

    const bonuses = ctx.db.query.signupBonus
      .findMany({
        with: {
          pointProgram: true,
          card: { with: { product: { with: { issuer: true } }, owner: true, business: true } }
        }
      })
      .sync()
      .filter((b) => isBonusOpen(b, today))
      .map((b) => {
        const computed = computeBonus(b, b.pointProgram?.valuationCpp)
        const daysLeft = b.deadline ? daysUntil(b.deadline, new Date(today + 'T00:00:00')) : null
        const remaining = computed.remainingSpendCents
        const requiredMonthlyCents =
          remaining != null && daysLeft != null && daysLeft > 0
            ? Math.round(remaining / (daysLeft / 30.44))
            : null
        return {
          id: b.id,
          card: b.card,
          deadline: b.deadline,
          daysLeft,
          targetSpendCents: b.targetSpendCents,
          spendSoFarCents: b.spendSoFarCents,
          remainingCents: remaining,
          valueCents: computed.valueCents,
          requiredMonthlyCents,
          pace: computed.pace
        }
      })
      .sort((a, b) => (a.deadline ?? '9999') < (b.deadline ?? '9999') ? -1 : 1)

    const fees = ctx.db.query.card
      .findMany({ with: { product: { with: { issuer: true } }, owner: true, business: true } })
      .sync()
      .map((c) => ({ card: c, renewal: nextFeeRenewal(c, today) }))
      .filter(
        (r): r is typeof r & { renewal: NonNullable<typeof r.renewal> } =>
          r.renewal != null && r.renewal.daysUntil <= KEY_DATE_FEE_DAYS
      )
      .sort((a, b) => a.renewal.daysUntil - b.renewal.daysUntil)

    const totalRemainingCents = bonuses.reduce((n, b) => n + (b.remainingCents ?? 0), 0)
    let clearDate: string | null = null
    if (totalRemainingCents > 0 && rate.cents > 0) {
      const days = Math.ceil((totalRemainingCents / rate.cents) * 30.44)
      const d = new Date(today + 'T00:00:00')
      d.setDate(d.getDate() + days)
      clearDate = toIsoDate(d)
    }

    return {
      monthlyRateCents: rate.cents,
      rateSource: rate.source,
      bonuses,
      fees,
      totalRemainingCents,
      clearDate
    }
  }),

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
      .findMany({ with: { pointProgram: true, card: { columns: { openedDate: true } } } })
      .sync()
      .map((b) => ({
        received: b.received,
        receivedDate: b.receivedDate,
        cardOpenedDate: b.card?.openedDate ?? null,
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
    const cards = ctx.db
      .select({
        annualFeeCents: card.annualFeeCents,
        openedDate: card.openedDate,
        closedDate: card.closedDate
      })
      .from(card)
      .all()

    return buildReport({ spendEntries, bonuses, referrals, benefits, cards })
  })
})
