/**
 * Is a card still worth pointing recurring charges at?
 *
 * A recurring payment ideally bills a card that's mid-bonus, so the charge
 * works toward the minimum spend. Once the card has no bonus left to feed
 * (never had one, or every bonus is received / past its spend target), the
 * payment should probably move — the UI flags those.
 */

import { isBonusOpen, type BonusSpendLike } from './bonus'

export type CardSpendStatus = 'working' | 'no_bonus' | 'bonus_done'

export function cardSpendStatus(bonuses: BonusSpendLike[], today?: string): CardSpendStatus {
  if (bonuses.length === 0) return 'no_bonus'
  return bonuses.some((b) => isBonusOpen(b, today)) ? 'working' : 'bonus_done'
}
