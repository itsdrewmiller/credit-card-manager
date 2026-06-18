/** Minimal CSV: quotes fields containing comma/quote/newline, doubles quotes. */
function escapeField(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Rows of flat objects -> CSV string. Columns = union of all keys. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return ''
  const cols = Array.from(rows.reduce((set, r) => {
    Object.keys(r).forEach((k) => set.add(k))
    return set
  }, new Set<string>()))
  const header = cols.map(escapeField).join(',')
  const body = rows.map((r) => cols.map((c) => escapeField(r[c])).join(',')).join('\n')
  return `${header}\n${body}`
}
