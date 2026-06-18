import React, { useState } from 'react'
import { Drawer } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { trpc } from '../trpc'
import { CardForm, type CardFormValue } from './CardForm'
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
  const utils = trpc.useUtils()
  const productOpts = trpc.products.listForSelect.useQuery()
  const people = trpc.people.list.useQuery()
  const businesses = trpc.businesses.list.useQuery()

  const [opened, setOpened] = useState(false)
  const [editing, setEditing] = useState<CardRow | null>(null)

  const invalidate = (): void => {
    void utils.cards.list.invalidate()
    void utils.cards.needsInfo.invalidate()
    void utils.system.health.invalidate()
  }
  const onError = (e: { message: string }): void => {
    notifications.show({ color: 'red', message: e.message })
  }

  const create = trpc.cards.create.useMutation({ onSuccess: invalidate, onError })
  const update = trpc.cards.update.useMutation({ onSuccess: invalidate, onError })

  const productOptions = (productOpts.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))
  const peopleOptions = (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))
  const businessOptions = (businesses.data ?? []).map((b) => ({ value: String(b.id), label: b.name }))

  const submit = (value: CardFormValue): void => {
    const opts = {
      onSuccess: () => {
        setOpened(false)
        notifications.show({ message: editing ? 'Card updated' : 'Card added' })
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
