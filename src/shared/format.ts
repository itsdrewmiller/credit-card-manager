/** Pure formatting/parsing helpers shared across processes. */

/** Integer cents -> "$1,234.56". null/undefined -> "—". */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

/** "$1,234.56" or "1234.56" or 1234.56 -> integer cents. Empty -> null. */
export function parseCents(input: string | number | null | undefined): number | null {
  if (input == null || input === '') return null
  const n = typeof input === 'number' ? input : Number(String(input).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/** Integer cents -> dollars number for editable form inputs. */
export function centsToDollars(cents: number | null | undefined): number | '' {
  return cents == null ? '' : cents / 100
}

export function formatPoints(points: number | null | undefined): string {
  if (points == null) return '—'
  return new Intl.NumberFormat('en-US').format(points)
}

/** points * cents-per-point -> integer cents. */
export function pointsValueCents(
  points: number | null | undefined,
  cpp: number | null | undefined
): number | null {
  if (points == null || cpp == null) return null
  return Math.round(points * cpp)
}

/** The cash value of a bonus: explicit cash, else points * cpp. */
export function bonusValueCents(args: {
  cashAmountCents?: number | null
  pointsAmount?: number | null
  valuationCpp?: number | null
}): number | null {
  if (args.cashAmountCents != null) return args.cashAmountCents
  return pointsValueCents(args.pointsAmount, args.valuationCpp)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Days from today (negative = past). null if no date. */
export function daysUntil(iso: string | null | undefined, today = new Date()): number | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((d.getTime() - base.getTime()) / 86_400_000)
}

/** ISO date 'YYYY-MM-DD' for `n` months before `from`. */
export function isoMonthsAgo(months: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth() - months, from.getDate())
  return d.toISOString().slice(0, 10)
}

export function toIsoDate(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** date + n days; null-safe for optional form values. */
export function addDays(d: Date | null | undefined, days: number | null | undefined): Date | null {
  if (!d || days == null) return null
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

/** Whole days between start and deadline; null if either is missing or the span is negative. */
export function daysBetween(
  start: Date | null | undefined,
  deadline: Date | null | undefined
): number | null {
  if (!start || !deadline) return null
  const d = Math.round((deadline.getTime() - start.getTime()) / 86_400_000)
  return d >= 0 ? d : null
}
