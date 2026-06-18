/** Renderer-side date helpers bridging Mantine DateInput (Date) <-> ISO text. */

export function isoToDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

export function dateToIso(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
