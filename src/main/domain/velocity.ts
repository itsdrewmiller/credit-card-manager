/**
 * 5/24-style opening velocity.
 *
 * The Chase 5/24 rule counts *personal* credit cards opened across all issuers
 * in the last 24 months. Business cards (from most issuers) don't report to the
 * personal bureau and don't count, so we exclude cards with a businessId.
 * Only actually-opened cards count (openedDate present, not rejected/applied).
 */

export interface VelocityCardLike {
  id: number
  openedDate: string | null
  businessId: number | null
  /** Business cards from a few issuers report to the personal bureaus. */
  reportsToPersonal?: boolean | null
  status: string
  product?: { issuer?: { name: string } | null; name: string } | null
  rawCreditorName?: string | null
}

const COUNTABLE_STATUSES = new Set(['open', 'closed', 'product_changed'])

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function countsTowardVelocity(c: VelocityCardLike): boolean {
  const personalReporting = c.businessId == null || c.reportsToPersonal === true
  return personalReporting && c.openedDate != null && COUNTABLE_STATUSES.has(c.status)
}

export interface PersonVelocity {
  /** Number of personal-reporting cards opened in the trailing 24 months. */
  count: number
  /** Those cards, newest first. */
  contributing: VelocityCardLike[]
  /** When the oldest contributing card ages out (a slot frees), or null. */
  nextFreeDate: string | null
  /** True once count >= 5 (Chase auto-declines). */
  atChase524: boolean
  /** When enough cards age out to be back under 5/24; null if already under. */
  under524Date: string | null
}

export function personVelocity(
  cards: VelocityCardLike[],
  today = new Date()
): PersonVelocity {
  const cutoff = (() => {
    const d = new Date(today.getFullYear(), today.getMonth() - 24, today.getDate())
    return d.toISOString().slice(0, 10)
  })()

  const contributing = cards
    .filter(countsTowardVelocity)
    .filter((c) => (c.openedDate as string) >= cutoff)
    .sort((a, b) => (b.openedDate as string).localeCompare(a.openedDate as string))

  const oldest = contributing[contributing.length - 1]
  const atChase524 = contributing.length >= 5

  // Back under 5/24 once all but four have aged out: the (count − 4)th-oldest
  // card's open date + 24 months.
  let under524Date: string | null = null
  if (atChase524) {
    const dropNeeded = contributing.length - 4
    const gate = contributing[contributing.length - dropNeeded] // newest-first list
    if (gate?.openedDate) under524Date = addMonthsIso(gate.openedDate, 24)
  }

  return {
    count: contributing.length,
    contributing,
    nextFreeDate: oldest?.openedDate ? addMonthsIso(oldest.openedDate, 24) : null,
    atChase524,
    under524Date
  }
}
