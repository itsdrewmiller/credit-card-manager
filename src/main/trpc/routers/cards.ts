import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import type { DB } from '../../db'
import { card, productBenefit, benefit } from '../../db/schema'
import { CARD_STATUSES } from '@shared/constants'
import { cardMissingFields } from '../../domain/needsInfo'
import { applyProductDefaults } from '../../domain/product'

/**
 * Copy a product's benefit templates onto a card. Idempotent by benefit name,
 * so it won't duplicate benefits already present on the card.
 */
function applyProductBenefits(db: DB, cardId: number, cardProductId: number): void {
  const templates = db
    .select()
    .from(productBenefit)
    .where(eq(productBenefit.cardProductId, cardProductId))
    .all()
  if (templates.length === 0) return
  const have = new Set(
    db.select({ name: benefit.name }).from(benefit).where(eq(benefit.cardId, cardId)).all().map((b) => b.name)
  )
  for (const t of templates) {
    if (have.has(t.name)) continue
    db.insert(benefit)
      .values({
        cardId,
        name: t.name,
        category: t.category,
        amountCents: t.amountCents,
        period: t.period,
        notes: t.notes
      })
      .run()
  }
}

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
  responsibility: z.string().nullish(),
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

  /** Live cards (open/applied) missing churning-critical fields. */
  needsInfo: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.card.findMany({ with: withRelations }).sync()
    return rows.map(enrich).filter((c) => c.missingFields.length > 0)
  }),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) => {
    const created = ctx.db.insert(card).values(applyProductDefaults(ctx.db, input)).returning().get()
    if (created.cardProductId != null) {
      applyProductBenefits(ctx.db, created.id, created.cardProductId)
    }
    return created
  }),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = applyProductDefaults(ctx.db, input)
      const before = ctx.db.select({ p: card.cardProductId }).from(card).where(eq(card.id, id)).get()
      const updated = ctx.db
        .update(card)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(card.id, id))
        .returning()
        .get()
      // When a product is newly assigned, seed its benefit templates.
      if (updated.cardProductId != null && updated.cardProductId !== before?.p) {
        applyProductBenefits(ctx.db, id, updated.cardProductId)
      }
      return updated
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(card).where(eq(card.id, input.id)).run()
      return { id: input.id }
    })
})
