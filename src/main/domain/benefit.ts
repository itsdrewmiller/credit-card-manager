import { daysUntil } from '@shared/format'

export type BenefitStatus = 'used' | 'available' | 'upcoming' | 'expired'

interface BenefitLike {
  amountCents?: number | null
  unitValue?: number | null
  useAfter?: string | null
  useBy?: string | null
  used?: boolean | null
}

/** Expected value = face amount × unit value (e.g. $10 credit at 1.0 = $10). */
export function benefitEvCents(b: BenefitLike): number | null {
  if (b.amountCents == null) return null
  return Math.round(b.amountCents * (b.unitValue ?? 1))
}

/**
 * Where a benefit sits in its usage window today:
 * - used: already consumed
 * - expired: past its use-by date
 * - upcoming: window hasn't opened yet (before use-after)
 * - available: usable right now
 */
export function benefitStatus(b: BenefitLike, today = new Date()): BenefitStatus {
  if (b.used) return 'used'
  const byDays = daysUntil(b.useBy, today)
  if (byDays != null && byDays < 0) return 'expired'
  const afterDays = daysUntil(b.useAfter, today)
  if (afterDays != null && afterDays > 0) return 'upcoming'
  return 'available'
}

export function computeBenefit(b: BenefitLike): { evCents: number | null; status: BenefitStatus } {
  return { evCents: benefitEvCents(b), status: benefitStatus(b) }
}
