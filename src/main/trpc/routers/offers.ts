import { z } from 'zod'
import { eq, desc, and, sql } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import type { DB } from '../../db'
import { productOffer, cardProduct, issuer } from '../../db/schema'
import { REWARD_KINDS } from '@shared/constants'
import { parseCsv } from '../../import/csv'

const upsert = z.object({
  cardProductId: z.number().int(),
  rewardKind: z.enum(REWARD_KINDS).nullish(),
  currency: z.string().nullish(),
  pointProgramId: z.number().int().nullish(),
  pointsAmount: z.number().int().nullish(),
  cashAmountCents: z.number().int().nullish(),
  pointValueCpp: z.number().nullish(),
  minSpendCents: z.number().int().nullish(),
  windowMonths: z.number().int().nullish(),
  expires: z.string().nullish(),
  notes: z.string().nullish()
})

const withRelations = {
  product: { with: { issuer: true } },
  pointProgram: true
} as const

/** value = cash, else points × the offer's cpp (falling back to a linked program). */
function enrich<
  T extends {
    cashAmountCents: number | null
    pointsAmount: number | null
    pointValueCpp: number | null
    pointProgram?: { valuationCpp: number | null } | null
  }
>(o: T): T & { valueCents: number | null } {
  let valueCents: number | null = null
  if (o.cashAmountCents != null) valueCents = o.cashAmountCents
  else {
    const cpp = o.pointValueCpp ?? o.pointProgram?.valuationCpp ?? null
    if (o.pointsAmount != null && cpp != null) valueCents = Math.round(o.pointsAmount * cpp)
  }
  return { ...o, valueCents }
}

// --- CSV import helpers ----------------------------------------------------

function findOrCreateIssuer(db: DB, name: string): number {
  const existing = db
    .select({ id: issuer.id })
    .from(issuer)
    .where(sql`lower(${issuer.name}) = ${name.toLowerCase()}`)
    .get()
  if (existing) return existing.id
  return db.insert(issuer).values({ name }).returning({ id: issuer.id }).get().id
}

function findOrCreateProduct(
  db: DB,
  issuerId: number,
  name: string,
  isBusiness: boolean,
  annualFeeCents: number | null
): number {
  const existing = db
    .select({ id: cardProduct.id })
    .from(cardProduct)
    .where(and(eq(cardProduct.issuerId, issuerId), sql`lower(${cardProduct.name}) = ${name.toLowerCase()}`))
    .get()
  if (existing) return existing.id
  return db
    .insert(cardProduct)
    .values({ issuerId, name, isBusiness, defaultAnnualFeeCents: annualFeeCents })
    .returning({ id: cardProduct.id })
    .get().id
}

const numOrNull = (s: string | undefined): number | null => {
  if (s == null || s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const centsOrNull = (s: string | undefined): number | null => {
  const n = numOrNull(s)
  return n == null ? null : Math.round(n * 100)
}

export const offersRouter = router({
  /** Available signup-bonus offers, by card product. */
  list: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.query.productOffer
      .findMany({ with: withRelations, orderBy: desc(productOffer.updatedAt) })
      .sync()
    return rows.map(enrich)
  }),

  create: publicProcedure.input(upsert).mutation(({ ctx, input }) =>
    ctx.db.insert(productOffer).values(input).returning().get()
  ),

  update: publicProcedure
    .input(upsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(productOffer)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(productOffer.id, id))
        .returning()
        .get()
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(productOffer).where(eq(productOffer.id, input.id)).run()
      return { id: input.id }
    }),

  /**
   * Import offers from the normalized signup-bonus CSV. Find-or-creates the
   * issuer and card product per row, then upserts one offer per product.
   */
  importCsv: publicProcedure
    .input(z.object({ text: z.string() }))
    .mutation(({ ctx, input }) => {
      const rows = parseCsv(input.text)
      const required = ['card_name', 'issuer', 'bonus_amount', 'bonus_currency']
      if (rows.length === 0 || !required.every((c) => c in rows[0])) {
        throw new Error('CSV does not match the signup-bonus format')
      }

      let created = 0
      let updated = 0
      ctx.db.transaction((tx) => {
        for (const r of rows) {
          const name = r.card_name?.trim()
          if (!name) continue
          const issuerName = r.issuer?.trim() || name.split(' ')[0]
          const isBusiness = r.is_business?.toLowerCase() === 'true'
          const feeCents = centsOrNull(r.annual_fee_usd)
          const issuerId = findOrCreateIssuer(tx as unknown as DB, issuerName)
          const productId = findOrCreateProduct(tx as unknown as DB, issuerId, name, isBusiness, feeCents)

          const currency = r.bonus_currency?.trim() || null
          const isCash = currency === 'USD'
          const amount = numOrNull(r.bonus_amount)
          const values = {
            cardProductId: productId,
            rewardKind: isCash ? ('cash' as const) : /mile/i.test(currency ?? '') ? ('miles' as const) : ('points' as const),
            currency,
            pointsAmount: isCash ? null : amount != null ? Math.round(amount) : null,
            cashAmountCents: isCash && amount != null ? Math.round(amount * 100) : null,
            pointValueCpp: numOrNull(r.point_value_cpp),
            minSpendCents: centsOrNull(r.min_spend_usd),
            windowMonths: numOrNull(r.spend_window_months),
            notes: r.notes?.trim() || null
          }

          const existing = tx
            .select({ id: productOffer.id })
            .from(productOffer)
            .where(eq(productOffer.cardProductId, productId))
            .get()
          if (existing) {
            tx.update(productOffer)
              .set({ ...values, updatedAt: Date.now() })
              .where(eq(productOffer.id, existing.id))
              .run()
            updated++
          } else {
            tx.insert(productOffer).values(values).run()
            created++
          }
        }
      })
      return { created, updated, total: created + updated }
    })
})
