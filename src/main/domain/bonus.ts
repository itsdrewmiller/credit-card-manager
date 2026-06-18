import { bonusValueCents } from '@shared/format'

export interface BonusComputed {
  /** Cash value: explicit cash, else points × program cpp. null if unknown. */
  valueCents: number | null
  /** target − spendSoFar, clamped at 0. null if no target. */
  remainingSpendCents: number | null
  /** Whether the min-spend target has been met. */
  spendMet: boolean
}

interface BonusLike {
  cashAmountCents?: number | null
  pointsAmount?: number | null
  targetSpendCents?: number | null
  spendSoFarCents?: number | null
}

/** Derive value + spend progress for a bonus given its program's valuation. */
export function computeBonus(b: BonusLike, valuationCpp: number | null | undefined): BonusComputed {
  const valueCents = bonusValueCents({
    cashAmountCents: b.cashAmountCents,
    pointsAmount: b.pointsAmount,
    valuationCpp
  })

  const target = b.targetSpendCents ?? null
  const soFar = b.spendSoFarCents ?? 0
  const remainingSpendCents = target == null ? null : Math.max(0, target - soFar)
  const spendMet = target == null ? false : soFar >= target

  return { valueCents, remainingSpendCents, spendMet }
}
