import React from 'react'
import { trpc } from '../trpc'
import { CardForm, type CardFormValue } from './CardForm'
import { useEntityEditor } from './useEntityEditor'
import { useInvalidateCards } from '../lib/mutations'
import { useBusinessOptions, usePeopleOptions, useProductOptions, useProgramOptions } from '../lib/options'
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

/** Shared add/edit-card drawer + mutations, reused everywhere cards are edited.
 *  Creating a card can create its signup bonus in the same submit. */
export function useCardEditor(): {
  openCreate: () => void
  openEdit: (c: CardRow) => void
  element: React.ReactElement
} {
  const utils = trpc.useUtils()
  const invalidate = useInvalidateCards()

  const create = trpc.cards.create.useMutation({ onSuccess: invalidate })
  const update = trpc.cards.update.useMutation({ onSuccess: invalidate })
  const createBonus = trpc.bonuses.create.useMutation({
    onSuccess: () => void utils.bonuses.list.invalidate()
  })

  const productOptions = useProductOptions()
  const peopleOptions = usePeopleOptions()
  const businessOptions = useBusinessOptions()
  const programOptions = useProgramOptions()
  const offers = trpc.offers.list.useQuery()

  return useEntityEditor<CardRow, CardFormValue>({
    entityLabel: 'card',
    container: 'drawer',
    titles: { edit: (c) => `Edit ${cardLabel(c)}` },
    // Manual entry always tags the source; imports go through the importer.
    create: {
      mutate: ({ bonus, ...v }, o) =>
        create.mutate(
          { ...v, source: 'manual' },
          {
            onSuccess: (card) => {
              if (bonus) createBonus.mutate({ cardId: card.id, ...bonus }, o)
              else o?.onSuccess?.()
            }
          }
        ),
      isPending: create.isPending || createBonus.isPending
    },
    update: {
      // Bonuses are edited on the Bonuses page once the card exists.
      mutate: ({ bonus: _bonus, ...v }, o) => update.mutate(v, o),
      isPending: update.isPending
    },
    form: ({ initial, submitting, onSubmit, onCancel }) => (
      <CardForm
        initial={initial ?? undefined}
        productOptions={productOptions}
        peopleOptions={peopleOptions}
        businessOptions={businessOptions}
        programOptions={programOptions}
        offers={offers.data ?? []}
        submitting={submitting}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )
  })
}
