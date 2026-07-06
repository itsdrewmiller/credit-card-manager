/** Money/points formatting and parsing shared across processes.
 *  Date helpers live in @shared/dates. */

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

/**
 * The cash value of an OFFER: explicit cash, else points × cpp. Unlike a held
 * bonus, an offer carries its own cpp estimate from the feed (pointValueCpp),
 * used as the fallback when the household doesn't track the program.
 */
export function offerValueCents(o: {
  cashAmountCents?: number | null
  pointsAmount?: number | null
  pointValueCpp?: number | null
  pointProgram?: { valuationCpp: number | null } | null
}): number | null {
  if (o.cashAmountCents != null) return o.cashAmountCents
  return pointsValueCents(o.pointsAmount, o.pointProgram?.valuationCpp ?? o.pointValueCpp)
}

