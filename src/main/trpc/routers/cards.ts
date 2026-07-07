import { z } from 'zod'
import { eq, desc, inArray } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import { card, benefit } from '../../db/schema'
import { CARD_STATUSES } from '@shared/constants'
import { todayIso } from '@shared/dates'
import { cardMissingFields } from '../../domain/needsInfo'
import { nextFeeRenewal, FEE_REMINDER_LEAD_DAYS } from '../../domain/fees'
import { sweptOnClose } from '../../domain/benefit'
import {
  applyProductBenefits,
  applyProductDefaults,
  productReportsToPersonal
} from '../../domain/product'
import { importCardsCsv } from '../../import/cards'

const upsert = z.object({
  cardProductId: z.number().int().nullish(),
  issuerId: z.number().int().nullish(),
  ownerPersonId: z.number().int().nullish(),
  businessId: z.number().int().nullish(),
  rawCreditorName: z.string().nullish(),
  rawAccountLabel: z.string().nullish(),
  network: z.string().nullish(),
  last4: z.string().nullish(),
  annualFeeCents: z.number().int().nullish(),
  status: z.enum(CARD_STATUSES).default('open'),
  autopay: z.boolean().default(false),
  reportsToPersonal: z.boolean().default(false),
  appliedDate: z.string().nullish(),
  openedDate: z.string().nullish(),
  closedDate: z.string().nullish(),
  rejectedDate: z.string().nullish(),
  rejectionReason: z.string().nullish(),
  source: z.string().default('manual'),
  notes: z.string().nullish()
})

const withRelations = {
  product: { with: { issuer: true } },
  owner: true,
  business: true,
  bonuses: { with: { pointProgram: true } },
  benefits: true
} as const

/** Enriched card row with derived missing-field list. */
function enrich<T extends { status: string | null } & Record<string, unknown>>(
  c: T
): T & { missingFields: ReturnType<typeof cardMissingFields> } {
  return { ...c, missingFields: cardMissingFields(c) }
}

export const cardsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.card
      .findMany({ with: withRelations, orderBy: desc(card.openedDate) })
      .sync()
    return rows.map(enrich)
  }),

  get: publicProcedure.input(z.object({ id: z.number().int() })).query(({ ctx, input }) => {
    const row = ctx.db.query.card
      .findFirst({ where: eq(card.id, input.id), with: withRelations })
      .sync()
    return row ? enrich(row) : null
  }),

  /** Open cards whose annual-fee renewal posts soon — close before it does. */
  upcomingFees: publicProcedure.query(({ ctx }) => {
    const today = todayIso()
    const rows = ctx.db.query.card
      .findMany({ with: { product: { with: { issuer: true } }, owner: true, business: true } })
      .sync()
    return rows
      .map((c) => ({ card: c, renewal: nextFeeRenewal(c, today) }))
      .filter(
        (r): r is typeof r & { renewal: NonNullable<typeof r.renewal> } =>
          r.renewal != null && r.renewal.daysUntil <= FEE_REMINDER_LEAD_DAYS
      )
      .sort((a, b) => a.renewal.daysUntil - b.renewal.daysUntil)
  }),

  /** Live cards (open/applied) missing churning-critical fields. */
  needsInfo: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.card.findMany({ with: withRelations }).sync()
    return rows.map(enrich).filter((c) => c.missingFields.length > 0)
  }),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) => {
    const values = applyProductDefaults(ctx.db, input)
    if (values.cardProductId != null && productReportsToPersonal(ctx.db, values.cardProductId)) {
      values.reportsToPersonal = true
    }
    const created = ctx.db.insert(card).values(values).returning().get()
    if (created.cardProductId != null) {
      applyProductBenefits(ctx.db, created.id, created.cardProductId)
    }
    return created
  }),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = applyProductDefaults(ctx.db, input)
      const before = ctx.db
        .select({ p: card.cardProductId, status: card.status })
        .from(card)
        .where(eq(card.id, id))
        .get()
      const updated = ctx.db
        .update(card)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(card.id, id))
        .returning()
        .get()
      // Closing a card sweeps its pending benefits (see sweptOnClose).
      if (rest.status === 'closed' && before?.status !== 'closed') {
        const today = todayIso()
        const swept = ctx.db
          .select({
            id: benefit.id,
            used: benefit.used,
            usedAmountCents: benefit.usedAmountCents,
            useBy: benefit.useBy
          })
          .from(benefit)
          .where(eq(benefit.cardId, id))
          .all()
          .filter((b) => sweptOnClose(b, today))
        if (swept.length > 0) {
          ctx.db.delete(benefit).where(inArray(benefit.id, swept.map((b) => b.id))).run()
        }
      }

      // When a product is newly assigned, seed its benefit templates and its
      // 5/24 default onto the card.
      if (updated.cardProductId != null && updated.cardProductId !== before?.p) {
        applyProductBenefits(ctx.db, id, updated.cardProductId)
        if (!updated.reportsToPersonal && productReportsToPersonal(ctx.db, updated.cardProductId)) {
          return ctx.db
            .update(card)
            .set({ reportsToPersonal: true })
            .where(eq(card.id, id))
            .returning()
            .get()
        }
      }
      return updated
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(card).where(eq(card.id, input.id)).run()
      return { id: input.id }
    }),

  /**
   * Import held cards from a CSV. Find-or-creates the issuer, card product,
   * owner, and business per row, then upserts one card per row.
   */
  importCsv: publicProcedure
    .input(z.object({ text: z.string() }))
    .mutation(({ ctx, input }) => importCardsCsv(ctx.db, input.text))
})
