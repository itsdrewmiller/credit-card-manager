import React, { useState } from 'react'
import { Drawer } from '@mantine/core'
import { trpc } from '../trpc'
import { CardForm, type CardFormValue } from './CardForm'
import { useInvalidateCards, showSuccess } from '../lib/mutations'
import type { CardRow } from '../lib/types'

export function cardLabel(c: { product?: { issuer?: { name: string } | null; name: string } | null; rawCreditorName?: string | null }): string {
  if (c.product) return `${c.product.issuer?.name ?? ''} ${c.product.name}`.trim()
  return c.rawCreditorName ?? 'Unknown card'
}

/** Shared add/edit-card drawer + mutations, reused by Cards and Needs-info. */
export function useCardEditor(): {
  openCreate: () => void
  openEdit: (c: CardRow) => void
  element: React.ReactElement
} {
  const productOpts = trpc.products.listForSelect.useQuery()
  const people = trpc.people.list.useQuery()
  const businesses = trpc.businesses.list.useQuery()

  const [opened, setOpened] = useState(false)
  const [editing, setEditing] = useState<CardRow | null>(null)

  const invalidate = useInvalidateCards()

  const create = trpc.cards.create.useMutation({ onSuccess: invalidate })
  const update = trpc.cards.update.useMutation({ onSuccess: invalidate })

  const productOptions = (productOpts.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))
  const peopleOptions = (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))
  const businessOptions = (businesses.data ?? []).map((b) => ({ value: String(b.id), label: b.name }))

  const submit = (value: CardFormValue): void => {
    const opts = {
      onSuccess: () => {
        setOpened(false)
        showSuccess(editing ? 'Card updated' : 'Card added')
      }
    }
    if (editing) update.mutate({ id: editing.id, ...value }, opts)
    else create.mutate({ ...value, source: 'manual' }, opts)
  }

  const element = (
    <Drawer
      opened={opened}
      onClose={() => setOpened(false)}
      position="right"
      size="lg"
      title={editing ? `Edit ${cardLabel(editing)}` : 'Add card'}
    >
      {opened && (
        <CardForm
          initial={editing ? (editing as unknown as Partial<CardFormValue>) : undefined}
          productOptions={productOptions}
          peopleOptions={peopleOptions}
          businessOptions={businessOptions}
          submitting={create.isPending || update.isPending}
          onSubmit={submit}
          onCancel={() => setOpened(false)}
        />
      )}
    </Drawer>
  )

  return {
    openCreate: () => {
      setEditing(null)
      setOpened(true)
    },
    openEdit: (c) => {
      setEditing(c)
      setOpened(true)
    },
    element
  }
}
