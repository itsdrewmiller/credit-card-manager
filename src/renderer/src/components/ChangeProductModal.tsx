import React, { useState } from 'react'
import { Button, Group, Modal, Select, Text, Textarea } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useMediaQuery } from '@mantine/hooks'
import { trpc } from '../trpc'
import { showSuccess, useInvalidateCards } from '../lib/mutations'
import { MODAL_SELECT_PROPS } from '../lib/touchSelect'
import { dateToIso } from '@shared/dates'
import type { CardRow } from '../lib/types'

/**
 * A real product change (downgrade/upgrade): the account converts to another
 * product without closing, and the old product stays on record as "ever
 * held". Correcting a wrongly-assigned product belongs in Edit instead —
 * that writes no history.
 */
export function ChangeProductModal({
  card,
  onClose
}: {
  card: CardRow | null
  onClose: () => void
}): React.ReactElement {
  const isMobile = useMediaQuery('(max-width: 47.99em)', false)
  const products = trpc.products.listForSelect.useQuery()
  const invalidate = useInvalidateCards()
  const utils = trpc.useUtils()
  const change = trpc.cards.changeProduct.useMutation({
    onSuccess: () => {
      invalidate()
      void utils.recommendations.overview.invalidate()
      showSuccess('Product change recorded')
      onClose()
    }
  })

  const [toProductId, setToProductId] = useState<string | null>(null)
  const [date, setDate] = useState<Date | null>(new Date())
  const [notes, setNotes] = useState('')

  const options = (products.data ?? [])
    .filter((p) => p.id !== card?.cardProductId)
    .map((p) => ({ value: String(p.id), label: p.label }))

  return (
    <Modal
      opened={card != null}
      onClose={onClose}
      title={card ? `Change product — same account, no close` : ''}
      fullScreen={isMobile}
    >
      <Text size="sm" c="dimmed" mb="sm">
        For downgrades/conversions (e.g. United Explorer → Gateway). The old product still counts
        as held for bonus rules. If the product was just assigned incorrectly, use Edit instead.
      </Text>
      <Select
        label="New product"
        withAsterisk
        data={options}
        value={toProductId}
        onChange={setToProductId}
        {...MODAL_SELECT_PROPS}
        mb="sm"
      />
      <DateInput label="Changed on" value={date} onChange={setDate} mb="sm" />
      <Textarea
        label="Notes"
        autosize
        minRows={2}
        value={notes}
        onChange={(e) => setNotes(e.currentTarget.value)}
        mb="md"
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={toProductId == null}
          loading={change.isPending}
          onClick={() =>
            card &&
            toProductId &&
            change.mutate({
              id: card.id,
              toProductId: Number(toProductId),
              changedDate: dateToIso(date),
              notes: notes.trim() || null
            })
          }
        >
          Record change
        </Button>
      </Group>
    </Modal>
  )
}
