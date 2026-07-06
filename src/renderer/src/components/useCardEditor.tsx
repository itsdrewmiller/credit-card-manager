import React from 'react'
import { trpc } from '../trpc'
import { CardForm, type CardFormValue } from './CardForm'
import { useEntityEditor } from './useEntityEditor'
import { useInvalidateCards } from '../lib/mutations'
import { useBusinessOptions, usePeopleOptions, useProductOptions } from '../lib/options'
import type { CardRow } from '../lib/types'

export function cardLabel(c: { product?: { issuer?: { name: string } | null; name: string } | null; rawCreditorName?: string | null }): string {
  if (c.product) return `${c.product.issuer?.name ?? ''} ${c.product.name}`.trim()
  return c.rawCreditorName ?? 'Unknown card'
}

/** Dropdown label: last-4 first (names run long and get truncated), then the card. */
export function cardSelectLabel(
  c: Parameters<typeof cardLabel>[0] & { last4?: string | null }
): string {
  const label = cardLabel(c)
  return c.last4 ? `····${c.last4} · ${label}` : label
}

/** Shared add/edit-card drawer + mutations, reused by Cards and Needs-info. */
export function useCardEditor(): {
  openCreate: () => void
  openEdit: (c: CardRow) => void
  element: React.ReactElement
} {
  const invalidate = useInvalidateCards()

  const create = trpc.cards.create.useMutation({ onSuccess: invalidate })
  const update = trpc.cards.update.useMutation({ onSuccess: invalidate })

  const productOptions = useProductOptions()
  const peopleOptions = usePeopleOptions()
  const businessOptions = useBusinessOptions()

  return useEntityEditor<CardRow, CardFormValue>({
    entityLabel: 'card',
    container: 'drawer',
    titles: { edit: (c) => `Edit ${cardLabel(c)}` },
    // Manual entry always tags the source; imports go through the importer.
    create: {
      mutate: (v, o) => create.mutate({ ...v, source: 'manual' }, o),
      isPending: create.isPending
    },
    update,
    form: ({ initial, submitting, onSubmit, onCancel }) => (
      <CardForm
        initial={initial ?? undefined}
        productOptions={productOptions}
        peopleOptions={peopleOptions}
        businessOptions={businessOptions}
        submitting={submitting}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )
  })
}
