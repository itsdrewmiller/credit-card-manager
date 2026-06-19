/**
 * Strip a leading issuer name/abbreviation from a product name so products read
 * as "Sapphire Reserve" (label "Chase — Sapphire Reserve") rather than
 * "Chase Sapphire Reserve" (label "Chase — Chase Sapphire Reserve").
 */
const ISSUER_PREFIXES: Record<string, string[]> = {
  'American Express': ['American Express', 'AmEx', 'Amex'],
  'Bank of America': ['Bank of America', 'BofA', 'BoA'],
  'U.S. Bank': ['U.S. Bank', 'US Bank', 'USB'],
  'Capital One': ['Capital One', 'Cap One', 'C1'],
  'Wells Fargo': ['Wells Fargo', 'WF']
}

export function stripIssuerPrefix(name: string, issuerName: string): string {
  const candidates = [issuerName, ...(ISSUER_PREFIXES[issuerName] ?? [])]
  for (const p of candidates) {
    if (name.toLowerCase().startsWith(p.toLowerCase() + ' ')) {
      const stripped = name.slice(p.length).trim()
      if (stripped.length > 0) return stripped
    }
  }
  return name
}
