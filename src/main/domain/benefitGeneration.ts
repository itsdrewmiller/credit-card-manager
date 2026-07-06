/**
 * Self-extending recurring benefits.
 *
 * Any dated benefit with a recurring period on an open card is treated as the
 * template for its own future: on each app load we extend the series until an
 * instance exists whose first-eligible date (useAfter) is at least a year out.
 * The next window is the previous one shifted by the period, which preserves
 * calendar-aligned windows (Apr 1–30 → May 1–31) and anniversary-style ones
 * (Sep 8–Sep 23 → next year) alike. Multiplicity is preserved: two $10 credits
 * in the latest window beget two per future window.
 *
 * Benefits copied from a product template arrive undated; those get seeded
 * with the calendar window containing `today`, then extend like the rest.
 *
 * To stop a series: delete ALL of its future instances AND clear the period on
 * the remaining ones (or delete every instance of that name on the card).
 */

import { addMonthsIso } from '@shared/dates'

export interface BenefitInstance {
  id: number
  cardId: number
  name: string
  category: string | null
  amountCents: number | null
  valuePct: number | null
  period: string | null
  useAfter: string | null
  useBy: string | null
  notes: string | null
}

export interface NewBenefit {
  cardId: number
  name: string
  category: string | null
  amountCents: number | null
  valuePct: number | null
  period: string | null
  year: number
  useAfter: string
  useBy: string
  notes: string | null
}

export interface GenerationPlan {
  /** New future instances to insert. */
  create: NewBenefit[]
  /** Undated template copies to stamp with their first window. */
  date: { id: number; useAfter: string; useBy: string; year: number }[]
}

const PERIOD_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12
}

const iso = (y: number, m0: number, d: number): string =>
  `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const lastDayOf = (y: number, m0: number): number => new Date(y, m0 + 1, 0).getDate()

/** Calendar window containing `today` for a period (monthly -> this month, …). */
function currentWindow(period: string, today: Date): { useAfter: string; useBy: string } | null {
  const y = today.getFullYear()
  const m0 = today.getMonth()
  switch (period) {
    case 'monthly':
      return { useAfter: iso(y, m0, 1), useBy: iso(y, m0, lastDayOf(y, m0)) }
    case 'quarterly': {
      const q0 = Math.floor(m0 / 3) * 3
      return { useAfter: iso(y, q0, 1), useBy: iso(y, q0 + 2, lastDayOf(y, q0 + 2)) }
    }
    case 'semiannual': {
      const h0 = m0 < 6 ? 0 : 6
      return { useAfter: iso(y, h0, 1), useBy: iso(y, h0 + 5, lastDayOf(y, h0 + 5)) }
    }
    case 'annual':
      return { useAfter: iso(y, 0, 1), useBy: iso(y, 11, 31) }
    default:
      return null
  }
}

/**
 * Plan the instances needed so every recurring series on the given (open-card)
 * benefits reaches at least `today + 1 year` of first-eligible coverage.
 */
export function planBenefitGeneration(instances: BenefitInstance[], today: Date): GenerationPlan {
  const horizon = iso(today.getFullYear() + 1, today.getMonth(), today.getDate())
  const plan: GenerationPlan = { create: [], date: [] }

  const groups = new Map<string, BenefitInstance[]>()
  for (const b of instances) {
    if (!b.period || PERIOD_MONTHS[b.period] == null) continue
    const key = `${b.cardId}|${b.name}`
    const g = groups.get(key)
    if (g) g.push(b)
    else groups.set(key, [b])
  }

  for (const g of groups.values()) {
    const months = PERIOD_MONTHS[g[0].period as string]
    const dated = g.filter((b) => b.useAfter && b.useBy)

    // Seed template copies that arrived without dates.
    if (dated.length === 0) {
      const w = currentWindow(g[0].period as string, today)
      if (!w) continue
      for (const b of g) {
        plan.date.push({ ...w, id: b.id, year: Number(w.useAfter.slice(0, 4)) })
      }
      dated.push(...g.map((b) => ({ ...b, useAfter: w.useAfter, useBy: w.useBy })))
    }

    // Extend from the latest window, preserving its shape and multiplicity.
    let latest = dated.reduce((a, b) => ((a.useAfter as string) >= (b.useAfter as string) ? a : b))
    const multiplicity = dated.filter((b) => b.useAfter === latest.useAfter).length
    let { useAfter, useBy } = latest as { useAfter: string; useBy: string }

    let guard = 0
    while (useAfter < horizon && guard++ < 60) {
      useAfter = addMonthsIso(useAfter, months)
      useBy = addMonthsIso(useBy, months)
      for (let i = 0; i < multiplicity; i++) {
        plan.create.push({
          cardId: latest.cardId,
          name: latest.name,
          category: latest.category,
          amountCents: latest.amountCents,
          valuePct: latest.valuePct,
          period: latest.period,
          year: Number(useAfter.slice(0, 4)),
          useAfter,
          useBy,
          notes: latest.notes
        })
      }
    }
  }

  return plan
}
