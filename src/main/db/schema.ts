import { sql, relations } from 'drizzle-orm'
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
// Relative import (not @shared): drizzle-kit loads this file with its own
// bundler, which doesn't resolve the alias.
import { CARD_STATUSES } from '../../shared/constants'

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
  // Average monthly spend over the last 12 months, measured from this
  // person's imported credit report (actual payments across accounts).
  // Summed across people it's the default monthly-spend projection for
  // recommendations.
  avgMonthlySpendCents: integer('avg_monthly_spend_cents'),
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

/**
 * Product-change (downgrade/upgrade) history for a card: the same account
 * converted to a different product — e.g. United Explorer → Gateway — without
 * closing. The card row keeps its openedDate (account age, 5/24) and simply
 * points at the new product; each conversion is recorded here so past
 * products still count as "ever held" for bonus-eligibility rules. Plain
 * product corrections (fixing a wrong assignment via Edit) intentionally
 * write no history.
 */
export const cardProductChange = sqliteTable(
  'card_product_change',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    fromProductId: integer('from_product_id').references(() => cardProduct.id, {
      onDelete: 'set null'
    }),
    toProductId: integer('to_product_id').references(() => cardProduct.id, { onDelete: 'set null' }),
    changedDate: text('changed_date'),
    notes: text('notes'),
    ...timestamps
  },
  (t) => ({
    cardIdx: index('card_product_change_card_idx').on(t.cardId)
  })
)

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
    // Baseline earn rate as a percent (2 = 2%); counted as cash-back return
    // on tracked spend in Reports.
    defaultCashbackPct: real('default_cashback_pct'),
    // Business products from a few issuers (notably Capital One) report to the
    // personal bureaus, so their cards count toward 5/24. Seeded by rule.
    reportsToPersonal: integer('reports_to_personal', { mode: 'boolean' }).notNull().default(false),
    // Official issuer page to apply for this product; recommendations link it
    // when no referral link is stored. Fed by the offer CSV's apply_url.
    applyUrl: text('apply_url'),
    // Charge / hybrid pay-over-time products (Amex Green/Gold/Platinum…):
    // exempt from Amex's 5-card, 1-in-5, and 2-in-90 credit-card rules.
    isCharge: integer('is_charge', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    ...timestamps
  },
  (t) => ({
    issuerIdx: index('card_product_issuer_idx').on(t.issuerId)
  })
)

/** Issuer name variants as they appear on bureau reports; the matcher corpus. */
export const issuerAlias = sqliteTable(
  'issuer_alias',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    issuerId: integer('issuer_id')
      .notNull()
      .references(() => issuer.id, { onDelete: 'cascade' }),
    aliasText: text('alias_text').notNull()
  },
  (t) => ({
    issuerIdx: index('issuer_alias_issuer_idx').on(t.issuerId)
  })
)

// --- Cards (actual accounts held) ------------------------------------------

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

    status: text('status', { enum: CARD_STATUSES }).notNull().default('open'),

    // Whether autopay is configured with the issuer — a churner safety net
    // (a missed payment can claw back a bonus and ding the bureau).
    autopay: integer('autopay', { mode: 'boolean' }).notNull().default(false),

    // Business cards from a few issuers (Capital One, Discover, TD…) report to
    // the personal bureaus and therefore count toward 5/24 despite being
    // business cards. Irrelevant for personal cards (they always count).
    reportsToPersonal: integer('reports_to_personal', { mode: 'boolean' }).notNull().default(false),

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
    // When the bonus actually posted — drives the return timeline in reports.
    receivedDate: text('received_date'),
    notes: text('notes'),
    ...timestamps
  },
  (t) => ({
    cardIdx: index('bonus_card_idx').on(t.cardId)
  })
)

// --- Card assignments (places that keep a card on file) ---------------------
// "Amazon charges the Venture" — a merchant/service and its default card, with
// no schedule or amount attached. Tracked so charges can be steered toward
// cards still earning a bonus: the UI flags assignments whose card has no
// signup bonus left to work on.

export const recurringPayment = sqliteTable(
  'recurring_payment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    // The card currently on file; unassigned when the card is deleted.
    cardId: integer('card_id').references(() => card.id, { onDelete: 'set null' }),
    notes: text('notes'),
    ...timestamps
  },
  (t) => ({
    cardIdx: index('recurring_payment_card_idx').on(t.cardId)
  })
)

// --- Spend entries (the dated ledger behind a bonus's spend-so-far) ---------
// spendSoFarCents on signup_bonus stays as the cached total; every change to
// it flows through a dated entry here so reports can chart spend over time.

export const spendEntry = sqliteTable(
  'spend_entry',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bonusId: integer('bonus_id')
      .notNull()
      .references(() => signupBonus.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(), // negative = correction
    date: text('date').notNull(),
    note: text('note'),
    ...timestamps
  },
  (t) => ({
    bonusIdx: index('spend_entry_bonus_idx').on(t.bonusId)
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
    amountCents: integer('amount_cents'), // face value of the credit
    // Personal redemption efficiency as a percent (50 = worth half of face).
    // Reports count amount × valuePct as the realized value; null = 100.
    valuePct: real('value_pct'),
    period: text('period'), // monthly | quarterly | semiannual | annual | one_time
    year: integer('year'),
    useAfter: text('use_after'),
    useBy: text('use_by'),
    used: integer('used', { mode: 'boolean' }).notNull().default(false),
    // Partial consumption: $65 of a $150 credit. Null with used=true means
    // the full face value was consumed.
    usedAmountCents: integer('used_amount_cents'),
    // When the credit was (first) consumed — drives the return timeline.
    usedDate: text('used_date'),
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
    // What the referrer earns when someone applies through their link —
    // recommendations add this to household value when a referral is possible.
    referralValueCents: integer('referral_value_cents'),
    // Part of the offer: no annual fee in the first year.
    feeWaivedFirstYear: integer('fee_waived_first_year', { mode: 'boolean' }).notNull().default(false),
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
    valuePct: real('value_pct'), // default redemption efficiency, copied to cards
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
  // Dollar value of the reward (rewardAmount is free text like "20,000 pts");
  // counted as return in reports once the referral is paid.
  rewardValueCents: integer('reward_value_cents'),
  rewardKind: text('reward_kind'),
  date: text('date'),
  status: text('status'), // pending | clicked | approved | paid
  notes: text('notes'),
  ...timestamps
})

// --- Referral links (stored per product, reused across applications) ---------
// A link's beneficiary is either a saved person/business (source 'user') or
// the app author (source 'seeded' — ships with the app; applying through it
// supports the developer, not the household). Only user links count toward
// recommendation ROI; any link marks the product as referral-capable.

export const referralLink = sqliteTable('referral_link', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cardProductId: integer('card_product_id')
    .notNull()
    .references(() => cardProduct.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  ownerPersonId: integer('owner_person_id').references(() => person.id, { onDelete: 'cascade' }),
  ownerBusinessId: integer('owner_business_id').references(() => business.id, {
    onDelete: 'cascade'
  }),
  source: text('source').notNull().default('user'), // 'seeded' | 'user'
  notes: text('notes'),
  ...timestamps
})

// --- Recommendation rules (the dynamic rules engine) -------------------------
// Each row is one rule: a kind from the fixed vocabulary implemented in
// domain/recommend.ts plus JSON params. Defaults ship in data/default_rules.json
// and seed on first run; users add/tune/disable rules from the UI.

export const recommendationRule = sqliteTable('recommendation_rule', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  params: text('params').notNull().default('{}'), // JSON, validated per kind
  notes: text('notes'),
  ...timestamps
})

// --- App settings (small key/value store) ------------------------------------

export const appSetting = sqliteTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
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
  products: many(cardProduct),
  aliases: many(issuerAlias)
}))

export const cardProductRelations = relations(cardProduct, ({ one, many }) => ({
  issuer: one(issuer, { fields: [cardProduct.issuerId], references: [issuer.id] }),
  cards: many(card)
}))

export const issuerAliasRelations = relations(issuerAlias, ({ one }) => ({
  issuer: one(issuer, { fields: [issuerAlias.issuerId], references: [issuer.id] })
}))

export const cardRelations = relations(card, ({ one, many }) => ({
  product: one(cardProduct, { fields: [card.cardProductId], references: [cardProduct.id] }),
  issuer: one(issuer, { fields: [card.issuerId], references: [issuer.id] }),
  owner: one(person, { fields: [card.ownerPersonId], references: [person.id] }),
  business: one(business, { fields: [card.businessId], references: [business.id] }),
  bonuses: many(signupBonus),
  benefits: many(benefit),
  recurringPayments: many(recurringPayment),
  productChanges: many(cardProductChange)
}))

export const cardProductChangeRelations = relations(cardProductChange, ({ one }) => ({
  card: one(card, { fields: [cardProductChange.cardId], references: [card.id] }),
  fromProduct: one(cardProduct, {
    fields: [cardProductChange.fromProductId],
    references: [cardProduct.id]
  }),
  toProduct: one(cardProduct, {
    fields: [cardProductChange.toProductId],
    references: [cardProduct.id]
  })
}))

export const recurringPaymentRelations = relations(recurringPayment, ({ one }) => ({
  card: one(card, { fields: [recurringPayment.cardId], references: [card.id] })
}))

export const pointProgramRelations = relations(pointProgram, ({ one, many }) => ({
  owner: one(person, { fields: [pointProgram.ownerPersonId], references: [person.id] }),
  bonuses: many(signupBonus)
}))

export const signupBonusRelations = relations(signupBonus, ({ one, many }) => ({
  card: one(card, { fields: [signupBonus.cardId], references: [card.id] }),
  pointProgram: one(pointProgram, {
    fields: [signupBonus.pointProgramId],
    references: [pointProgram.id]
  }),
  spendEntries: many(spendEntry)
}))

export const spendEntryRelations = relations(spendEntry, ({ one }) => ({
  bonus: one(signupBonus, { fields: [spendEntry.bonusId], references: [signupBonus.id] })
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

export const referralLinkRelations = relations(referralLink, ({ one }) => ({
  product: one(cardProduct, { fields: [referralLink.cardProductId], references: [cardProduct.id] }),
  ownerPerson: one(person, { fields: [referralLink.ownerPersonId], references: [person.id] }),
  ownerBusiness: one(business, {
    fields: [referralLink.ownerBusinessId],
    references: [business.id]
  })
}))

export const schema = {
  person,
  business,
  issuer,
  cardProduct,
  issuerAlias,
  card,
  pointProgram,
  signupBonus,
  spendEntry,
  benefit,
  productOffer,
  productBenefit,
  referral,
  referralLink,
  recurringPayment,
  recommendationRule,
  appSetting,
  cardProductChange,
  personRelations,
  businessRelations,
  issuerRelations,
  issuerAliasRelations,
  cardProductRelations,
  cardRelations,
  pointProgramRelations,
  signupBonusRelations,
  spendEntryRelations,
  benefitRelations,
  productOfferRelations,
  productBenefitRelations,
  referralRelations,
  referralLinkRelations,
  recurringPaymentRelations,
  cardProductChangeRelations
}
