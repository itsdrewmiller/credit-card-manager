import { addMonthsIso, daysUntil } from '@shared/dates'

/**
 * Upcoming annual-fee renewals — cards worth closing (or downgrading) before
 * the fee posts again. Mirrors the report's synthesized fee schedule: charges
 * land at openedDate + 1 month + 12·n. The opening-year charge (n = 0) is
 * excluded — that fee is already spent; reminders are about not paying it
 * AGAIN, so the first renewal is at opened + 13 months.
 */

/** Surface renewals this many days out — enough time to plan a close/downgrade. */
export const FEE_REMINDER_LEAD_DAYS = 60

export interface FeeRenewal {
  /** Date the next renewal fee posts (per the synthesized schedule). */
  renewalDate: string
  daysUntil: number
  feeCents: number
}

export function nextFeeRenewal(
  c: {
    status: string
    annualFeeCents: number | null
    openedDate: string | null
  },
  today: string
): FeeRenewal | null {
  if (c.status !== 'open' || !c.openedDate || !c.annualFeeCents || c.annualFeeCents <= 0) {
    return null
  }
  let charge = addMonthsIso(c.openedDate, 13)
  while (charge <= today) charge = addMonthsIso(charge, 12)
  const days = daysUntil(charge, new Date(today + 'T00:00:00'))
  if (days == null) return null
  return { renewalDate: charge, daysUntil: days, feeCents: c.annualFeeCents }
}
