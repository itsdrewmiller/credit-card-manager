import { sql, relations } from 'drizzle-orm'
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

/**
 * Conventions
 * - Money is stored as INTEGER cents (avoid float drift). e.g. $95.00 -> 9500.
 * - Point valuation is REAL cents-per-point (cpp). e.g. 1.5 = 1.5 cents/point.
 * - Dates are TEXT ISO 'YYYY-MM-DD'. Timestamps are INTEGER epoch millis.
 * - Booleans use integer({ mode: 'boolean' }).
 * - Almost every card field is nullable so a card can exist as a partial stub
 *   (see FEATURE_MAP.md "Needs info" inbox).
 */

const timestamps = {
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
}

// --- People & businesses ---------------------------------------------------

export const person = sqliteTable('person', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  notes: text('notes'),
  ...timestamps
})

export const business = sqliteTable('business', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  ownerPersonId: integer('owner_person_id')
    .notNull()
    .references(() => person.id, { onDelete: 'cascade' }),
  // LLC | Sole Proprietor | S-Corp | Partnership | Other
  type: text('type'),
  notes: text('notes'),
  ...timestamps
})

// --- Issuers & the product catalog -----------------------------------------

export const issuer = sqliteTable('issuer', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique()
})

export const cardProduct = sqliteTable(
  'card_product',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    issuerId: integer('issuer_id')
      .notNull()
      .references(() => issuer.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    network: text('network'), // Visa | Mastercard | Amex | Discover
    isBusiness: integer('is_business', { mode: 'boolean' }).notNull().default(false),
    defaultAnnualFeeCents: integer('default_annual_fee_cents'),
    notes: text('notes'),
    ...timestamps
  },
  (t) => ({
    issuerIdx: index('card_product_issuer_idx').on(t.issuerId)
  })
)

/** Name variants as they appear on bureau reports; the fuzzy-match corpus. */
export const cardProductAlias = sqliteTable(
  'card_product_alias',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardProductId: integer('card_product_id')
      .notNull()
      .references(() => cardProduct.id, { onDelete: 'cascade' }),
    aliasText: text('alias_text').notNull()
  },
  (t) => ({
    productIdx: index('alias_product_idx').on(t.cardProductId)
  })
)

// --- Cards (actual accounts held) ------------------------------------------

export const CARD_STATUS = ['applied', 'open', 'closed', 'product_changed', 'rejected'] as const
export type CardStatus = (typeof CARD_STATUS)[number]

export const card = sqliteTable(
  'card',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardProductId: integer('card_product_id').references(() => cardProduct.id, {
      onDelete: 'set null'
    }),
    // The bank/issuer this card belongs to. Set even when the exact product is
    // unknown (e.g. from a credit-report match) — used to dedupe imports.
    issuerId: integer('issuer_id').references(() => issuer.id, { onDelete: 'set null' }),
    ownerPersonId: integer('owner_person_id').references(() => person.id, {
      onDelete: 'set null'
    }),
    businessId: integer('business_id').references(() => business.id, { onDelete: 'set null' }),

    // Raw values preserved from the credit report (kept even after a match, so a
    // wrong/uncertain match can be revisited).
    rawCreditorName: text('raw_creditor_name'),
    rawAccountLabel: text('raw_account_label'),

    network: text('network'),
    last4: text('last4'), // captured from the Equifax report where shown
    annualFeeCents: integer('annual_fee_cents'),

    status: text('status').notNull().default('open'), // CARD_STATUS
    // Responsibility from the report: 'individual' | 'authorized_user'
    responsibility: text('responsibility'),

    appliedDate: text('applied_date'),
    openedDate: text('opened_date'),
    closedDate: text('closed_date'),
    rejectedDate: text('rejected_date'),
    rejectionReason: text('rejection_reason'),

    source: text('source').notNull().default('manual'), // manual | imported
    notes: text('notes'),
    ...timestamps
  },
  (t) => ({
    ownerIdx: index('card_owner_idx').on(t.ownerPersonId),
    productIdx: index('card_product_idx').on(t.cardProductId),
    statusIdx: index('card_status_idx').on(t.status)
  })
)

// --- Points programs & valuations ------------------------------------------

export const pointProgram = sqliteTable('point_program', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(), // Amex MR, Chase UR, United MileagePlus, ...
  ownerPersonId: integer('owner_person_id').references(() => person.id, { onDelete: 'set null' }),
  kind: text('kind'), // transferable | airline | hotel | cashback
  valuationCpp: real('valuation_cpp'), // cents per point; drives bonus value
  balance: integer('balance'), // optional current balance, in points
  balanceUpdated: text('balance_updated'),
  nextExpiration: text('next_expiration'),
  notes: text('notes'),
  ...timestamps
})

// --- Signup bonuses --------------------------------------------------------

export const signupBonus = sqliteTable(
  'signup_bonus',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),

    targetSpendCents: integer('target_spend_cents'),
    startDate: text('start_date'),
    deadline: text('deadline'),
    spendSoFarCents: integer('spend_so_far_cents').notNull().default(0),

    rewardKind: text('reward_kind'), // points | cash | miles
    pointProgramId: integer('point_program_id').references(() => pointProgram.id, {
      onDelete: 'set null'
    }),
    pointsAmount: integer('points_amount'),
    cashAmountCents: integer('cash_amount_cents'),
    referralBonus: text('referral_bonus'),

    received: integer('received', { mode: 'boolean' }).notNull().default(false),
    amountUsedCents: integer('amount_used_cents'),
    notes: text('notes'),
    ...timestamps
  },
  (t) => ({
    cardIdx: index('bonus_card_idx').on(t.cardId)
  })
)

// --- Benefits (recurring perks/credits) ------------------------------------

export const benefit = sqliteTable(
  'benefit',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category'), // Groceries, Travel, Dining, ...
    amountCents: integer('amount_cents'), // value of the credit
    period: text('period'), // monthly | quarterly | semiannual | annual | one_time
    year: integer('year'),
    useAfter: text('use_after'),
    useBy: text('use_by'),
    used: integer('used', { mode: 'boolean' }).notNull().default(false),
    confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
    isSubscription: integer('is_subscription', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    ...timestamps
  },
  (t) => ({
    cardIdx: index('benefit_card_idx').on(t.cardId)
  })
)

// --- Available signup-bonus offers (tied to a card product, not a held card) ---

export const productOffer = sqliteTable(
  'product_offer',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardProductId: integer('card_product_id')
      .notNull()
      .references(() => cardProduct.id, { onDelete: 'cascade' }),
    rewardKind: text('reward_kind'), // points | cash | miles
    currency: text('currency'), // e.g. "Amex MR", "United miles", "USD"
    pointProgramId: integer('point_program_id').references(() => pointProgram.id, {
      onDelete: 'set null'
    }),
    pointsAmount: integer('points_amount'),
    cashAmountCents: integer('cash_amount_cents'),
    // The offer's own assumed valuation (cents/point) so its value is
    // self-contained, independent of which point programs the user tracks.
    pointValueCpp: real('point_value_cpp'),
    minSpendCents: integer('min_spend_cents'),
    windowMonths: integer('window_months'), // months to meet the min spend
    expires: text('expires'), // offer end date, if any
    notes: text('notes'),
    ...timestamps
  },
  (t) => ({
    productIdx: index('offer_product_idx').on(t.cardProductId)
  })
)

// --- Product benefit templates (copied onto a card when you add that type) ---

export const productBenefit = sqliteTable(
  'product_benefit',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardProductId: integer('card_product_id')
      .notNull()
      .references(() => cardProduct.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category'),
    amountCents: integer('amount_cents'),
    period: text('period'), // monthly | quarterly | semiannual | annual | one_time
    notes: text('notes'),
    ...timestamps
  },
  (t) => ({
    productIdx: index('product_benefit_product_idx').on(t.cardProductId)
  })
)

// --- Referrals -------------------------------------------------------------

export const referral = sqliteTable('referral', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fromPersonId: integer('from_person_id')
    .notNull()
    .references(() => person.id, { onDelete: 'cascade' }),
  toPersonId: integer('to_person_id').references(() => person.id, { onDelete: 'set null' }),
  cardProductId: integer('card_product_id').references(() => cardProduct.id, {
    onDelete: 'set null'
  }),
  link: text('link'),
  rewardAmount: text('reward_amount'),
  rewardKind: text('reward_kind'),
  date: text('date'),
  status: text('status'), // pending | clicked | approved | paid
  notes: text('notes'),
  ...timestamps
})

// --- Relations -------------------------------------------------------------

export const personRelations = relations(person, ({ many }) => ({
  businesses: many(business),
  cards: many(card),
  pointPrograms: many(pointProgram)
}))

export const businessRelations = relations(business, ({ one, many }) => ({
  owner: one(person, { fields: [business.ownerPersonId], references: [person.id] }),
  cards: many(card)
}))

export const issuerRelations = relations(issuer, ({ many }) => ({
  products: many(cardProduct)
}))

export const cardProductRelations = relations(cardProduct, ({ one, many }) => ({
  issuer: one(issuer, { fields: [cardProduct.issuerId], references: [issuer.id] }),
  aliases: many(cardProductAlias),
  cards: many(card)
}))

export const cardProductAliasRelations = relations(cardProductAlias, ({ one }) => ({
  product: one(cardProduct, {
    fields: [cardProductAlias.cardProductId],
    references: [cardProduct.id]
  })
}))

export const cardRelations = relations(card, ({ one, many }) => ({
  product: one(cardProduct, { fields: [card.cardProductId], references: [cardProduct.id] }),
  issuer: one(issuer, { fields: [card.issuerId], references: [issuer.id] }),
  owner: one(person, { fields: [card.ownerPersonId], references: [person.id] }),
  business: one(business, { fields: [card.businessId], references: [business.id] }),
  bonuses: many(signupBonus),
  benefits: many(benefit)
}))

export const pointProgramRelations = relations(pointProgram, ({ one, many }) => ({
  owner: one(person, { fields: [pointProgram.ownerPersonId], references: [person.id] }),
  bonuses: many(signupBonus)
}))

export const signupBonusRelations = relations(signupBonus, ({ one }) => ({
  card: one(card, { fields: [signupBonus.cardId], references: [card.id] }),
  pointProgram: one(pointProgram, {
    fields: [signupBonus.pointProgramId],
    references: [pointProgram.id]
  })
}))

export const benefitRelations = relations(benefit, ({ one }) => ({
  card: one(card, { fields: [benefit.cardId], references: [card.id] })
}))

export const productOfferRelations = relations(productOffer, ({ one }) => ({
  product: one(cardProduct, { fields: [productOffer.cardProductId], references: [cardProduct.id] }),
  pointProgram: one(pointProgram, {
    fields: [productOffer.pointProgramId],
    references: [pointProgram.id]
  })
}))

export const productBenefitRelations = relations(productBenefit, ({ one }) => ({
  product: one(cardProduct, {
    fields: [productBenefit.cardProductId],
    references: [cardProduct.id]
  })
}))

export const referralRelations = relations(referral, ({ one }) => ({
  from: one(person, { fields: [referral.fromPersonId], references: [person.id] }),
  to: one(person, { fields: [referral.toPersonId], references: [person.id] }),
  product: one(cardProduct, { fields: [referral.cardProductId], references: [cardProduct.id] })
}))

export const schema = {
  person,
  business,
  issuer,
  cardProduct,
  cardProductAlias,
  card,
  pointProgram,
  signupBonus,
  benefit,
  productOffer,
  productBenefit,
  referral,
  personRelations,
  businessRelations,
  issuerRelations,
  cardProductRelations,
  cardProductAliasRelations,
  cardRelations,
  pointProgramRelations,
  signupBonusRelations,
  benefitRelations,
  productOfferRelations,
  productBenefitRelations,
  referralRelations
}
