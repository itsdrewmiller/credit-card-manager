import { daysUntil } from '@shared/dates'

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

/**
 * Closing a card sweeps its pending benefits: anything unused (no full or
 * partial use) whose window hasn't expired. Used, partially used, and
 * already-expired benefits stay as history.
 */
export function sweptOnClose(
  b: { used: boolean; usedAmountCents: number | null; useBy: string | null },
  today: string
): boolean {
  return (
    !b.used &&
    (b.usedAmountCents == null || b.usedAmountCents <= 0) &&
    (b.useBy == null || b.useBy >= today)
  )
}

export interface UsedState {
  used: boolean
  usedDate: string | null
  usedAmountCents: number | null
}

export interface UsedPatch {
  used?: boolean
  usedDate?: string | null
  usedAmountCents?: number | null
}

/**
 * The one used/usedDate/usedAmount rule for every mutation path (full edit,
 * inline toggle, inline partial amount). usedDate records FIRST use and
 * drives the return timeline: stamped once any use appears (the flag or a
 * positive partial amount), preserved while any use remains, and cleared
 * when none does. An explicit usedDate in the patch wins. Non-positive
 * partial amounts normalize to null.
 */
export function applyUsedStamp(current: UsedState, patch: UsedPatch, today: string): UsedState {
  const used = patch.used ?? current.used
  const rawAmount =
    patch.usedAmountCents !== undefined ? patch.usedAmountCents : current.usedAmountCents
  const usedAmountCents = rawAmount != null && rawAmount > 0 ? rawAmount : null
  const anyUse = used || usedAmountCents != null
  const usedDate =
    patch.usedDate !== undefined ? patch.usedDate : anyUse ? (current.usedDate ?? today) : null
  return { used, usedDate, usedAmountCents }
}
