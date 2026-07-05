/**
 * Is a card still worth pointing recurring charges at?
 *
 * A recurring payment ideally bills a card that's mid-bonus, so the charge
 * works toward the minimum spend. Once the card has no bonus left to feed
 * (never had one, or every bonus is received / past its spend target), the
 * payment should probably move — the UI flags those.
 */

export type CardSpendStatus = 'working' | 'no_bonus' | 'bonus_done'

interface BonusLike {
  received: boolean
  targetSpendCents: number | null
  spendSoFarCents: number
}

export function cardSpendStatus(bonuses: BonusLike[]): CardSpendStatus {
  if (bonuses.length === 0) return 'no_bonus'
  const feedable = bonuses.some(
    (b) =>
      !b.received && !(b.targetSpendCents != null && b.spendSoFarCents >= b.targetSpendCents)
  )
  return feedable ? 'working' : 'bonus_done'
}
