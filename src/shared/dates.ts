/**
 * ISO-date ('YYYY-MM-DD') helpers shared across processes — the single home
 * for calendar math. Everything works in LOCAL time: Dates are read via their
 * local components and never serialized with toISOString(), which shifts the
 * calendar day for any non-UTC timezone. Month arithmetic clamps to real
 * month ends and keeps month-end dates at month-end (Apr 30 + 1mo = May 31,
 * Jan 31 + 1mo = Feb 28).
 */

const pad = (n: number): string => String(n).padStart(2, '0')

const isoFromParts = (y: number, m0: number, d: number): string =>
  `${y}-${pad(m0 + 1)}-${pad(d)}`

const lastDayOf = (y: number, m0: number): number => new Date(y, m0 + 1, 0).getDate()

/** Date -> 'YYYY-MM-DD' from local components. */
export function toIsoDate(d: Date): string {
  return isoFromParts(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Null-tolerant Date -> ISO bridge for optional form values. */
export function dateToIso(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  return toIsoDate(d)
}

/** ISO -> Date at local midnight; null for missing/invalid input. */
export function isoToDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

/** Today's local calendar date as ISO. */
export function todayIso(now = new Date()): string {
  return toIsoDate(now)
}

/** iso + n months (n may be negative); month-end stays month-end. */
export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const wasEom = d === lastDayOf(y, m - 1)
  const total = m - 1 + months
  const ny = y + Math.floor(total / 12)
  const nm0 = ((total % 12) + 12) % 12
  const day = wasEom ? lastDayOf(ny, nm0) : Math.min(d, lastDayOf(ny, nm0))
  return isoFromParts(ny, nm0, day)
}

/** ISO date n months before `from` (local). */
export function monthsAgoIso(months: number, from = new Date()): string {
  return addMonthsIso(toIsoDate(from), -months)
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
