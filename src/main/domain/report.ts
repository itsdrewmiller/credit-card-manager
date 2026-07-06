import { bonusValueCents } from '@shared/format'

/**
 * Monthly spend / return series for the Reports page.
 *
 * Spend = dated spend_entry rows (the ledger behind each bonus's progress).
 * Return lands on the timeline when it actually materializes:
 *  - signup bonuses on their receivedDate (valued as cash, else points × cpp)
 *  - referrals on their date once status is 'paid'
 *  - benefit credits on their usedDate
 *  - baseline cash back (the product's default earn rate) on each spend entry
 */

export interface MonthRow {
  /** 'YYYY-MM' */
  month: string
  spendCents: number
  bonusReturnCents: number
  referralReturnCents: number
  benefitReturnCents: number
  cashbackReturnCents: number
  returnCents: number
}

export interface ReportInput {
  spendEntries: { amountCents: number; date: string; cashbackPct?: number | null }[]
  bonuses: {
    received: boolean
    receivedDate: string | null
    cashAmountCents: number | null
    pointsAmount: number | null
    valuationCpp: number | null
  }[]
  referrals: { status: string | null; date: string | null; rewardValueCents: number | null }[]
  benefits: {
    used: boolean
    usedDate: string | null
    amountCents: number | null
    /** Partial consumption; null with used=true means full face value. */
    usedAmountCents?: number | null
    /** Personal redemption efficiency percent; null = full face value. */
    valuePct?: number | null
  }[]
}

export interface ReportOverview {
  /** Ascending, contiguous months from first to last activity. */
  months: MonthRow[]
  totals: {
    spendCents: number
    returnCents: number
    bonusReturnCents: number
    referralReturnCents: number
    benefitReturnCents: number
    cashbackReturnCents: number
    /** returnCents / spendCents, or null with no tracked spend. */
    returnOnSpend: number | null
  }
}

const monthOf = (isoDate: string): string => isoDate.slice(0, 7)

function emptyRow(month: string): MonthRow {
  return {
    month,
    spendCents: 0,
    bonusReturnCents: 0,
    referralReturnCents: 0,
    benefitReturnCents: 0,
    cashbackReturnCents: 0,
    returnCents: 0
  }
}

/** 'YYYY-MM' + 1 month. */
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function buildReport(input: ReportInput): ReportOverview {
  const rows = new Map<string, MonthRow>()
  const at = (month: string): MonthRow => {
    let row = rows.get(month)
    if (!row) {
      row = emptyRow(month)
      rows.set(month, row)
    }
    return row
  }

  for (const e of input.spendEntries) {
    if (!e.date) continue
    const row = at(monthOf(e.date))
    row.spendCents += e.amountCents
    // Baseline earn rides along with the spend (negative entries claw it back).
    if (e.cashbackPct != null && e.cashbackPct > 0) {
      row.cashbackReturnCents += Math.round((e.amountCents * e.cashbackPct) / 100)
    }
  }
  for (const b of input.bonuses) {
    if (!b.received || !b.receivedDate) continue
    const value = bonusValueCents({
      cashAmountCents: b.cashAmountCents,
      pointsAmount: b.pointsAmount,
      valuationCpp: b.valuationCpp
    })
    if (value != null) at(monthOf(b.receivedDate)).bonusReturnCents += value
  }
  for (const r of input.referrals) {
    if (r.status === 'paid' && r.date && r.rewardValueCents != null) {
      at(monthOf(r.date)).referralReturnCents += r.rewardValueCents
    }
  }
  for (const b of input.benefits) {
    if (!b.usedDate) continue
    // What was actually consumed: an explicit partial amount wins; a benefit
    // marked used without one counts at face value.
    const consumed = b.usedAmountCents ?? (b.used ? b.amountCents : null)
    if (consumed == null || consumed <= 0) continue
    const factor = b.valuePct == null ? 1 : b.valuePct / 100
    at(monthOf(b.usedDate)).benefitReturnCents += Math.round(consumed * factor)
  }

  // Contiguous ascending months so charts don't silently skip quiet periods.
  const present = [...rows.keys()].sort()
  const months: MonthRow[] = []
  if (present.length > 0) {
    for (let m = present[0]; m <= present[present.length - 1]; m = nextMonth(m)) {
      const row = rows.get(m) ?? emptyRow(m)
      row.returnCents =
        row.bonusReturnCents +
        row.referralReturnCents +
        row.benefitReturnCents +
        row.cashbackReturnCents
      months.push(row)
    }
  }

  const totals = months.reduce(
    (t, r) => ({
      spendCents: t.spendCents + r.spendCents,
      returnCents: t.returnCents + r.returnCents,
      bonusReturnCents: t.bonusReturnCents + r.bonusReturnCents,
      referralReturnCents: t.referralReturnCents + r.referralReturnCents,
      benefitReturnCents: t.benefitReturnCents + r.benefitReturnCents,
      cashbackReturnCents: t.cashbackReturnCents + r.cashbackReturnCents,
      returnOnSpend: null as number | null
    }),
    {
      spendCents: 0,
      returnCents: 0,
      bonusReturnCents: 0,
      referralReturnCents: 0,
      benefitReturnCents: 0,
      cashbackReturnCents: 0,
      returnOnSpend: null as number | null
    }
  )
  totals.returnOnSpend = totals.spendCents > 0 ? totals.returnCents / totals.spendCents : null

  return { months, totals }
}
