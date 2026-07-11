import type { CardStatus } from '@shared/constants'

/**
 * One color vocabulary for every status badge:
 *   green  — realized (open card, received bonus, paid referral, available benefit)
 *   teal   — earned, pending payout (bonus spend met, referral approved)
 *   blue   — in progress (applied, on track, clicked, upcoming)
 *   orange — needs attention (behind pace, missing info)
 *   red    — dead (rejected, overdue, expired)
 *   gray   — inactive (closed, pending, used)
 */

export const CARD_STATUS_COLOR: Record<CardStatus, string> = {
  applied: 'blue',
  open: 'green',
  closed: 'gray',
  product_changed: 'grape',
  rejected: 'red',
  withdrawn: 'gray'
}

export const REFERRAL_STATUS_COLOR: Record<string, string> = {
  pending: 'gray',
  clicked: 'blue',
  approved: 'teal',
  paid: 'green'
}

export const BENEFIT_STATUS_BADGE: Record<string, { color: string; label: string }> = {
  available: { color: 'green', label: 'Available' },
  upcoming: { color: 'blue', label: 'Upcoming' },
  used: { color: 'gray', label: 'Used' },
  expired: { color: 'red', label: 'Expired' }
}

/** Progress-bar pace: green met, blue on track, orange behind, red overdue. */
export const BONUS_PACE_COLOR: Record<string, string> = {
  met: 'green',
  on_track: 'blue',
  behind: 'orange',
  overdue: 'red',
  unknown: 'blue'
}
