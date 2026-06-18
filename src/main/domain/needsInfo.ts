import { CARD_REQUIRED_FIELDS, type CardRequiredField } from '@shared/constants'

/** Fields on a card that matter for churning; null/undefined => missing. */
type CardLike = Partial<Record<CardRequiredField, unknown>> & { status?: string | null }

/**
 * Which churning-critical fields a card is missing. Only "live" cards
 * (open/applied) are evaluated — closed/rejected/product_changed cards are
 * historical and not nagged about.
 */
export function cardMissingFields(card: CardLike): CardRequiredField[] {
  if (card.status && card.status !== 'open' && card.status !== 'applied') return []
  return CARD_REQUIRED_FIELDS.filter((f) => card[f] == null)
}
