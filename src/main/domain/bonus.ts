import { bonusValueCents, daysUntil } from '@shared/format'

/**
 * Where a bonus stands against its spend window:
 * - met: min spend reached
 * - on_track: spend fraction >= elapsed-time fraction of the window
 * - behind: spending slower than the window is elapsing
 * - overdue: deadline passed without meeting the target
 * - unknown: not enough data (no target, no deadline, or no start date)
 */
export type BonusPace = 'met' | 'on_track' | 'behind' | 'overdue' | 'unknown'

export interface BonusComputed {
  /** Cash value: explicit cash, else points × program cpp. null if unknown. */
  valueCents: number | null
  /** target − spendSoFar, clamped at 0. null if no target. */
  remainingSpendCents: number | null
  /** Whether the min-spend target has been met. */
  spendMet: boolean
  pace: BonusPace
}

interface BonusLike {
  cashAmountCents?: number | null
  pointsAmount?: number | null
  targetSpendCents?: number | null
  spendSoFarCents?: number | null
  startDate?: string | null
  deadline?: string | null
}

function paceOf(b: BonusLike, spendMet: boolean, today: Date): BonusPace {
  const target = b.targetSpendCents
  if (target == null || target <= 0) return 'unknown'
  if (spendMet) return 'met'
  const daysLeft = daysUntil(b.deadline, today)
  if (daysLeft == null) return 'unknown'
  if (daysLeft < 0) return 'overdue'
  if (!b.startDate || !b.deadline) return 'unknown'
  const start = new Date(b.startDate + 'T00:00:00').getTime()
  const end = new Date(b.deadline + 'T00:00:00').getTime()
  if (!(end > start)) return 'unknown'
  const timeFraction = Math.min(1, Math.max(0, (today.getTime() - start) / (end - start)))
  const spendFraction = (b.spendSoFarCents ?? 0) / target
  return spendFraction >= timeFraction ? 'on_track' : 'behind'
}

/** Derive value + spend progress for a bonus given its program's valuation. */
export function computeBonus(
  b: BonusLike,
  valuationCpp: number | null | undefined,
  today = new Date()
): BonusComputed {
  const valueCents = bonusValueCents({
    cashAmountCents: b.cashAmountCents,
    pointsAmount: b.pointsAmount,
    valuationCpp
  })

  const target = b.targetSpendCents ?? null
  const soFar = b.spendSoFarCents ?? 0
  const remainingSpendCents = target == null ? null : Math.max(0, target - soFar)
  const spendMet = target == null ? false : soFar >= target

  return { valueCents, remainingSpendCents, spendMet, pace: paceOf(b, spendMet, today) }
}
