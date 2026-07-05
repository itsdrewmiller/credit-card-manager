import { eq, inArray } from 'drizzle-orm'
import type { DbLike } from './index'
import { benefit, card } from './schema'
import { planBenefitGeneration } from '../domain/benefitGeneration'

/**
 * Extend recurring benefit series on open cards so each has instances at
 * least a year ahead (see domain/benefitGeneration.ts). Runs on every app
 * load; idempotent once coverage exists. Returns how much it did.
 */
export function generateUpcomingBenefits(
  db: DbLike,
  today = new Date()
): { created: number; dated: number } {
  const openCardIds = db
    .select({ id: card.id })
    .from(card)
    .where(eq(card.status, 'open'))
    .all()
    .map((c) => c.id)
  if (openCardIds.length === 0) return { created: 0, dated: 0 }

  const instances = db
    .select({
      id: benefit.id,
      cardId: benefit.cardId,
      name: benefit.name,
      category: benefit.category,
      amountCents: benefit.amountCents,
      valuePct: benefit.valuePct,
      period: benefit.period,
      useAfter: benefit.useAfter,
      useBy: benefit.useBy,
      notes: benefit.notes
    })
    .from(benefit)
    .where(inArray(benefit.cardId, openCardIds))
    .all()

  const plan = planBenefitGeneration(instances, today)
  if (plan.create.length === 0 && plan.date.length === 0) return { created: 0, dated: 0 }

  db.transaction((tx) => {
    for (const d of plan.date) {
      tx.update(benefit)
        .set({ useAfter: d.useAfter, useBy: d.useBy, year: d.year, updatedAt: Date.now() })
        .where(eq(benefit.id, d.id))
        .run()
    }
    for (const b of plan.create) {
      tx.insert(benefit).values(b).run()
    }
  })
  return { created: plan.create.length, dated: plan.date.length }
}
