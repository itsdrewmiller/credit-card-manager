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

/**
 * Strip offer/region cruft that source data sometimes appends to a card name,
 * so the product name is just the card (no "$200", "Bonus", region notes, or a
 * trailing points figure). Conservative: only removes clearly-offer trailing text.
 */
export function cleanCardName(name: string): string {
  let s = name.trim()
  s = s.replace(/\s*\([^)]*\)\s*$/, '').trim() // trailing "(Many States)", "($300)"
  s = s.replace(/\s+[–—-]\s+.*$/, '').trim() // trailing " – NY & CT"
  s = s.replace(/\s*\$\d.*$/, '').trim() // from a "$200…" amount to the end
  s = s.replace(/\s+bonus$/i, '').trim() // trailing "Bonus"
  s = s.replace(/\s+\d[\d,]*k?(\s+offer)?$/i, '').trim() // trailing "30,000" / "100k Offer"
  return s || name.trim()
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
