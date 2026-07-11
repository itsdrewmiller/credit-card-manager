import { bonusValueCents } from '@shared/format'
import { daysUntil, isoToDate } from '@shared/dates'

/**
 * Where a bonus stands against its spend window:
 * - met: min spend reached
 * - on_track: spend fraction >= elapsed-time fraction of the window
 * - behind: spending slower than the window is elapsing
 * - overdue: deadline passed without meeting the target
 * - unknown: not enough data (no target, no deadline, or no card open date)
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
  /** The spend window always opens when the card is opened. */
  card?: { openedDate?: string | null } | null
  deadline?: string | null
}

function paceOf(b: BonusLike, spendMet: boolean, today: Date): BonusPace {
  const target = b.targetSpendCents
  if (target == null || target <= 0) return 'unknown'
  if (spendMet) return 'met'
  const daysLeft = daysUntil(b.deadline, today)
  if (daysLeft == null) return 'unknown'
  if (daysLeft < 0) return 'overdue'
  const startDate = isoToDate(b.card?.openedDate)
  const endDate = isoToDate(b.deadline)
  if (!startDate || !endDate) return 'unknown'
  const start = startDate.getTime()
  const end = endDate.getTime()
  if (!(end > start)) return 'unknown'
  const timeFraction = Math.min(1, Math.max(0, (today.getTime() - start) / (end - start)))
  const spendFraction = (b.spendSoFarCents ?? 0) / target
  return spendFraction >= timeFraction ? 'on_track' : 'behind'
}

export interface BonusSpendLike {
  received: boolean
  targetSpendCents: number | null
  spendSoFarCents: number
  deadline?: string | null
}

/** target − spendSoFar, clamped at 0. null when there is no target. */
export function bonusRemainingCents(
  b: Pick<BonusSpendLike, 'targetSpendCents' | 'spendSoFarCents'>
): number | null {
  return b.targetSpendCents == null ? null : Math.max(0, b.targetSpendCents - b.spendSoFarCents)
}

/**
 * THE definition of a bonus that can still be earned — every consumer
 * (recurring-payment steering, the finish-open-bonuses gate, progress views)
 * shares it: not received, min spend not met, and its deadline (when it has
 * one and `today` is supplied) not passed. A null target can't be "met", so
 * such bonuses stay open until marked received.
 */
export function isBonusOpen(b: BonusSpendLike, today?: string): boolean {
  if (b.received) return false
  const remaining = bonusRemainingCents(b)
  if (remaining != null && remaining <= 0) return false
  if (today != null && b.deadline != null && b.deadline < today) return false
  return true
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

  const remainingSpendCents = bonusRemainingCents({
    targetSpendCents: b.targetSpendCents ?? null,
    spendSoFarCents: b.spendSoFarCents ?? 0
  })
  const spendMet = remainingSpendCents != null && remainingSpendCents <= 0

  return { valueCents, remainingSpendCents, spendMet, pace: paceOf(b, spendMet, today) }
}
