import { trpc } from '../trpc'
import { cardSelectLabel } from '../components/useCardEditor'

export interface SelectOption {
  value: string
  label: string
}

/** Select options for pickers, one hook per entity. Each wraps its own query
 *  (react-query dedupes), so pages that also need the raw rows keep their own. */

export function usePeopleOptions(): SelectOption[] {
  const people = trpc.people.list.useQuery()
  return (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))
}

export function useProductOptions(): SelectOption[] {
  const products = trpc.products.listForSelect.useQuery()
  return (products.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))
}

export function useBusinessOptions(): SelectOption[] {
  const businesses = trpc.businesses.list.useQuery()
  return (businesses.data ?? []).map((b) => ({ value: String(b.id), label: b.name }))
}

export function useCardOptions(): (SelectOption & { openedDate: string | null })[] {
  const cards = trpc.cards.list.useQuery()
  return (cards.data ?? []).map((c) => ({
    value: String(c.id),
    label: cardSelectLabel(c),
    // Bonus windows open with the card, so pickers can anchor date math on it.
    openedDate: c.openedDate
  }))
}

export function useProgramOptions(): (SelectOption & { valuationCpp: number | null })[] {
  const programs = trpc.points.listForSelect.useQuery()
  return (programs.data ?? []).map((p) => ({
    value: String(p.id),
    label: p.label,
    valuationCpp: p.valuationCpp
  }))
}
