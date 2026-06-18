import Fuse from 'fuse.js'

export interface AliasRow {
  issuerId: number
  issuerName: string
  aliasText: string
}

export interface IssuerMatch {
  issuerId: number
  issuerName: string
  /** 0..1, higher = more confident. */
  confidence: number
}

/**
 * Experian "Account Name" values are issuer-level (e.g. "CHASE CARD"), so we
 * fuzzy-match the creditor name to an issuer via the catalog's alias corpus.
 * The exact product stays unmatched (a stub the user completes later).
 */
export function buildIssuerMatcher(rows: AliasRow[]): {
  match: (creditorName: string) => IssuerMatch | null
} {
  // Dedupe alias->issuer (aliases are issuer-derived, so each maps to one issuer).
  const seen = new Set<string>()
  const corpus: AliasRow[] = []
  for (const r of rows) {
    const key = `${r.aliasText}|${r.issuerId}`
    if (!seen.has(key)) {
      seen.add(key)
      corpus.push(r)
    }
  }

  const fuse = new Fuse(corpus, {
    keys: ['aliasText'],
    includeScore: true,
    threshold: 0.45,
    ignoreLocation: true,
    minMatchCharLength: 3
  })

  return {
    match(creditorName: string): IssuerMatch | null {
      const cleaned = creditorName.trim().toUpperCase()
      const results = fuse.search(cleaned)
      const best = results[0]
      if (!best || best.score == null) return null
      return {
        issuerId: best.item.issuerId,
        issuerName: best.item.issuerName,
        confidence: Math.round((1 - best.score) * 100) / 100
      }
    }
  }
}
