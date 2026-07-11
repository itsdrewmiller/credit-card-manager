/** Shared enums/labels used by both the main process (schema/validation) and the
 *  renderer (form selects). No DB or Node deps so it's safe to import anywhere. */

export const CARD_STATUSES = [
  'applied',
  'open',
  'closed',
  'product_changed',
  'rejected',
  // Application abandoned before submitting (e.g. Amex's no-bonus warning):
  // tracked, but never counts as an application or as having held the card.
  'withdrawn'
] as const
export type CardStatus = (typeof CARD_STATUSES)[number]

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  applied: 'Applied',
  open: 'Open',
  closed: 'Closed',
  product_changed: 'Product changed',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn'
}

export const NETWORKS = ['Visa', 'Mastercard', 'Amex', 'Discover'] as const
export type Network = (typeof NETWORKS)[number]

export const BUSINESS_TYPES = [
  'LLC',
  'Sole Proprietor',
  'S-Corp',
  'C-Corp',
  'Partnership',
  'Other'
] as const

export const POINT_PROGRAM_KINDS = ['transferable', 'airline', 'hotel', 'cashback'] as const
export type PointProgramKind = (typeof POINT_PROGRAM_KINDS)[number]

export const REWARD_KINDS = ['points', 'cash', 'miles'] as const
export type RewardKind = (typeof REWARD_KINDS)[number]

export const BENEFIT_PERIODS = [
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'one_time'
] as const
export type BenefitPeriod = (typeof BENEFIT_PERIODS)[number]

export const REFERRAL_STATUSES = ['pending', 'clicked', 'approved', 'paid'] as const
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number]

/** Fields a card needs before it's "complete enough" for churning. Drives the
 *  Needs-info inbox. Keep in sync with the importer + UI. */
export const CARD_REQUIRED_FIELDS = [
  'cardProductId',
  'ownerPersonId',
  'annualFeeCents',
  'openedDate'
] as const
export type CardRequiredField = (typeof CARD_REQUIRED_FIELDS)[number]

export const CARD_FIELD_LABELS: Record<CardRequiredField | 'bonus', string> = {
  cardProductId: 'Matched product',
  ownerPersonId: 'Owner',
  annualFeeCents: 'Annual fee',
  openedDate: 'Open date',
  bonus: 'Signup bonus'
}
