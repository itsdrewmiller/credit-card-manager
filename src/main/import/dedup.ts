/**
 * Dedupe imported tradelines against cards already in the database.
 *
 * Two cards are the "same" when they were opened on the same date and belong to
 * the same bank (issuer). When the issuer can't be resolved for one side, we
 * fall back to a conservative normalized-name comparison so we don't hide a
 * genuinely new card.
 */

export interface DedupCard {
  id: number
  openedDate: string | null
  issuerId: number | null
  name: string // raw creditor name or product name
}

export interface DedupTradeline {
  creditorName: string
  openedDate: string | null
  issuerId: number | null
}

export function normalizeName(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim()
}

/** Conservative: equal normalized names, or one clearly contains the other. */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (na.length < 5 || nb.length < 5) return na.length > 0 && na === nb
  return na === nb || na.includes(nb) || nb.includes(na)
}

/** Returns the id of an existing card the tradeline duplicates, or null. */
export function findDuplicate(t: DedupTradeline, existing: DedupCard[]): number | null {
  if (!t.openedDate) return null // can't dedupe without an open date
  for (const e of existing) {
    if (e.openedDate !== t.openedDate) continue
    const issuerMatch = t.issuerId != null && e.issuerId != null && t.issuerId === e.issuerId
    if (issuerMatch || namesMatch(t.creditorName, e.name)) return e.id
  }
  return null
}
