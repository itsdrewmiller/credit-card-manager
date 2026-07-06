import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import type { DbLike } from '../../db'
import { recommendationRule, spendEntry } from '../../db/schema'
import { recommend } from '../../domain/recommend'
import { importOffersCsv } from '../../import/offers'
import { getSetting, setSetting } from '../../db/settings'

export const DEFAULT_FEED_URL =
  'https://raw.githubusercontent.com/itsdrewmiller/credit-card-manager/main/data/signup_bonuses.csv'
export const FEED_URL_KEY = 'offer_feed_url'
export const FEED_REFRESHED_KEY = 'offer_feed_refreshed_at'

const ruleUpsert = z.object({
  kind: z.string().min(1),
  enabled: z.boolean().default(true),
  params: z.string().refine(
    (s) => {
      try {
        const v = JSON.parse(s)
        return typeof v === 'object' && v != null && !Array.isArray(v)
      } catch {
        return false
      }
    },
    { message: 'Params must be a JSON object' }
  ),
  notes: z.string().nullish()
})

function enabledRules(db: DbLike): { kind: string; params: Record<string, unknown> }[] {
  return db
    .select()
    .from(recommendationRule)
    .where(eq(recommendationRule.enabled, true))
    .all()
    .map((r) => ({ kind: r.kind, params: JSON.parse(r.params) as Record<string, unknown> }))
}

/** Fetch the offer-feed CSV and upsert offers. Exported for the weekly check. */
export async function refreshOfferFeed(
  db: DbLike
): Promise<{ url: string; created: number; updated: number; total: number }> {
  const url = getSetting(db, FEED_URL_KEY) ?? DEFAULT_FEED_URL
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`Offer feed fetch failed: HTTP ${res.status} for ${url}`)
  const text = await res.text()
  const result = importOffersCsv(db, text)
  setSetting(db, FEED_REFRESHED_KEY, new Date().toISOString())
  return { url, ...result }
}

export const recommendationsRouter = router({
  /** Run the rules engine over current offers/cards/rules. */
  overview: publicProcedure.query(({ ctx }) => {
    const offers = ctx.db.query.productOffer
      .findMany({ with: { product: { with: { issuer: true } }, pointProgram: true } })
      .sync()
      .map((o) => ({
        id: o.id,
        cardProductId: o.cardProductId,
        productName: o.product?.name ?? 'Unknown product',
        issuerName: o.product?.issuer?.name ?? null,
        isBusiness: o.product?.isBusiness ?? false,
        reportsToPersonal: o.product?.reportsToPersonal ?? false,
        valueCents:
          o.cashAmountCents ??
          (o.pointsAmount != null && (o.pointValueCpp ?? o.pointProgram?.valuationCpp) != null
            ? Math.round(o.pointsAmount * (o.pointValueCpp ?? o.pointProgram!.valuationCpp!))
            : null),
        minSpendCents: o.minSpendCents,
        windowMonths: o.windowMonths,
        expires: o.expires
      }))
    const people = ctx.db.query.person.findMany().sync()
    const businesses = ctx.db.query.business.findMany().sync()
    const cards = ctx.db.query.card.findMany({ with: { product: true } }).sync()
    const spendEntries = ctx.db
      .select({ amountCents: spendEntry.amountCents, date: spendEntry.date })
      .from(spendEntry)
      .all()

    return {
      results: recommend({
        offers,
        people,
        businesses,
        cards,
        spendEntries,
        rules: enabledRules(ctx.db),
        today: new Date()
      }),
      feedRefreshedAt: getSetting(ctx.db, FEED_REFRESHED_KEY),
      feedUrl: getSetting(ctx.db, FEED_URL_KEY) ?? DEFAULT_FEED_URL
    }
  }),

  /** Manual "check for new offers now". */
  refreshFeed: publicProcedure.mutation(({ ctx }) => refreshOfferFeed(ctx.db)),

  listRules: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(recommendationRule).orderBy(asc(recommendationRule.id)).all()
  ),

  createRule: publicProcedure
    .input(ruleUpsert)
    .mutation(({ ctx, input }) =>
      ctx.db.insert(recommendationRule).values(input).returning().get()
    ),

  updateRule: publicProcedure
    .input(ruleUpsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      return ctx.db
        .update(recommendationRule)
        .set({ ...rest, updatedAt: Date.now() })
        .where(eq(recommendationRule.id, id))
        .returning()
        .get()
    }),

  deleteRule: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      ctx.db.delete(recommendationRule).where(eq(recommendationRule.id, input.id)).run()
      return { id: input.id }
    })
})
