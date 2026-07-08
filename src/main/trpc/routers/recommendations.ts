import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc'
import type { DbLike } from '../../db'
import { offerValueCents } from '@shared/format'
import { ruleParamsError } from '@shared/rules'
import { recommendationRule, spendEntry, person, appSetting } from '../../db/schema'
import { recommend } from '../../domain/recommend'
import { importOffersCsv } from '../../import/offers'
import { getSetting, setSetting } from '../../db/settings'
import { monthsAgoIso } from '@shared/dates'

export const DEFAULT_FEED_URL =
  'https://raw.githubusercontent.com/itsdrewmiller/credit-card-manager/main/data/signup_bonuses.csv'
export const FEED_URL_KEY = 'offer_feed_url'
export const FEED_REFRESHED_KEY = 'offer_feed_refreshed_at'
export const MONTHLY_SPEND_KEY = 'monthly_spend_override_cents'

/** Sum of per-person 12-month averages measured from imported credit reports. */
function reportDefaultCents(db: DbLike): number | null {
  const rows = db.select({ v: person.avgMonthlySpendCents }).from(person).all()
  const vals = rows.map((r) => r.v).filter((v): v is number => v != null)
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null
}

/** Tracked bonus-spend rate over the trailing 3 months. */
function activityCents(db: DbLike, today: Date): number {
  const cutoff = monthsAgoIso(3, today)
  const total = db
    .select({ amountCents: spendEntry.amountCents, date: spendEntry.date })
    .from(spendEntry)
    .all()
    .filter((e) => e.date >= cutoff)
    .reduce((n, e) => n + e.amountCents, 0)
  return Math.round(total / 3)
}

const ruleUpsert = z.object({
  kind: z.string().min(1),
  enabled: z.boolean().default(true),
  params: z.string(),
  notes: z.string().nullish()
})

/** Enforce the per-kind params contract (shared/rules.ts) before any write. */
function assertRuleParams(kind: string, params: string): void {
  const err = ruleParamsError(kind, params)
  if (err) throw new Error(`Invalid rule params: ${err}`)
}

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
        valueCents: offerValueCents(o),
        pointsAmount: o.pointsAmount,
        cashAmountCents: o.cashAmountCents,
        currency: o.pointProgram?.name ?? o.currency,
        earnPct: o.product?.defaultCashbackPct ?? null,
        referralValueCents: o.referralValueCents,
        annualFeeCents: o.product?.defaultAnnualFeeCents ?? null,
        feeWaivedFirstYear: o.feeWaivedFirstYear,
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
    const bonuses = ctx.db.query.signupBonus
      .findMany()
      .sync()
      .map((b) => ({
        targetSpendCents: b.targetSpendCents,
        spendSoFarCents: b.spendSoFarCents,
        deadline: b.deadline,
        received: b.received
      }))
    const referralLinks = ctx.db.query.referralLink
      .findMany({ with: { ownerPerson: true, ownerBusiness: true } })
      .sync()
      .map((l) => ({
        cardProductId: l.cardProductId,
        url: l.url,
        source: l.source,
        ownerPersonId: l.ownerPersonId ?? l.ownerBusiness?.ownerPersonId ?? null,
        ownerName: l.ownerPerson?.name ?? l.ownerBusiness?.name ?? null
      }))

    const today = new Date()
    const overrideRaw = getSetting(ctx.db, MONTHLY_SPEND_KEY)
    const overrideCents = overrideRaw != null ? Number(overrideRaw) : null
    const reportCents = reportDefaultCents(ctx.db)
    const effectiveCents = overrideCents ?? reportCents

    return {
      results: recommend({
        offers,
        people,
        businesses,
        cards,
        spendEntries,
        bonuses,
        referralLinks,
        rules: enabledRules(ctx.db),
        monthlySpendCents: effectiveCents,
        today
      }),
      monthlySpend: {
        overrideCents,
        reportDefaultCents: reportCents,
        activityCents: activityCents(ctx.db, today),
        effectiveCents
      },
      feedRefreshedAt: getSetting(ctx.db, FEED_REFRESHED_KEY),
      feedUrl: getSetting(ctx.db, FEED_URL_KEY) ?? DEFAULT_FEED_URL
    }
  }),

  /** Manual monthly-spend projection; null restores the report-based default. */
  setMonthlySpend: publicProcedure
    .input(z.object({ cents: z.number().int().min(0).nullable() }))
    .mutation(({ ctx, input }) => {
      if (input.cents == null) {
        ctx.db.delete(appSetting).where(eq(appSetting.key, MONTHLY_SPEND_KEY)).run()
      } else {
        setSetting(ctx.db, MONTHLY_SPEND_KEY, String(input.cents))
      }
      return { cents: input.cents }
    }),

  /** Manual "check for new offers now". */
  refreshFeed: publicProcedure.mutation(({ ctx }) => refreshOfferFeed(ctx.db)),

  listRules: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(recommendationRule).orderBy(asc(recommendationRule.id)).all()
  ),

  createRule: publicProcedure
    .input(ruleUpsert)
    .mutation(({ ctx, input }) => {
      assertRuleParams(input.kind, input.params)
      return ctx.db.insert(recommendationRule).values(input).returning().get()
    }),

  updateRule: publicProcedure
    .input(ruleUpsert.partial().extend({ id: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input
      if (rest.kind != null || rest.params != null) {
        const current = ctx.db
          .select({ kind: recommendationRule.kind, params: recommendationRule.params })
          .from(recommendationRule)
          .where(eq(recommendationRule.id, id))
          .get()
        assertRuleParams(rest.kind ?? current?.kind ?? '', rest.params ?? current?.params ?? '{}')
      }
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
