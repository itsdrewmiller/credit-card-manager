import { daysUntil } from '@shared/format'

export type BenefitStatus = 'used' | 'available' | 'upcoming' | 'expired'

interface BenefitLike {
  useAfter?: string | null
  useBy?: string | null
  used?: boolean | null
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

export function computeBenefit(b: BenefitLike): { status: BenefitStatus } {
  return { status: benefitStatus(b) }
}
