import React from 'react'
import { Button, Badge, Group, Text, Tooltip } from '@mantine/core'
import { IconPlus, IconAlertTriangle } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { QueryGate } from '../components/QueryGate'
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import {
  RecurringPaymentForm,
  type RecurringPaymentFormValue
} from '../components/RecurringPaymentForm'
import { cardLabel } from '../components/useCardEditor'
import { formatCents } from '@shared/format'
import type { RecurringPaymentRow } from '../lib/types'

/** The whole point of the page: flag cards whose spend no longer feeds a bonus. */
function CardCell({ r }: { r: RecurringPaymentRow }): React.ReactElement {
  if (!r.card) return <Text c="dimmed">Unassigned</Text>
  const alert =
    r.cardStatus === 'no_bonus'
      ? { label: 'No signup bonus', hint: 'This card has no bonus to work toward.' }
      : r.cardStatus === 'bonus_done'
        ? { label: 'Bonus met', hint: 'Minimum spend already achieved — this charge is wasted here.' }
        : null
  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm" fw={500}>
        {cardLabel(r.card)}
      </Text>
      {alert ? (
        <Tooltip label={`${alert.hint} Consider moving this payment.`} withArrow>
          <Badge
            color="red"
            variant="light"
            leftSection={<IconAlertTriangle size={12} />}
          >
            {alert.label}
          </Badge>
        </Tooltip>
      ) : (
        <Badge color="green" variant="light">
          Earning bonus
        </Badge>
      )}
    </Group>
  )
}

const COLUMNS: Column<RecurringPaymentRow>[] = [
  { header: 'Payment', render: (r) => <Text fw={500}>{r.name}</Text> },
  { header: 'Amount', render: (r) => formatCents(r.amountCents) },
  {
    header: 'Period',
    render: (r) => (
      <Text size="sm" c="dimmed">
        {r.period ?? '—'}
      </Text>
    )
  },
  { header: 'Billed to', render: (r) => <CardCell r={r} /> },
  { header: 'Notes', render: (r) => <Text c="dimmed">{r.notes}</Text> }
]

export function Recurring(): React.ReactElement {
  const utils = trpc.useUtils()
  const payments = trpc.recurringPayments.list.useQuery()
  const cards = trpc.cards.list.useQuery()

  const invalidate = (): void => void utils.recurringPayments.list.invalidate()

  const create = trpc.recurringPayments.create.useMutation({ onSuccess: invalidate })
  const update = trpc.recurringPayments.update.useMutation({ onSuccess: invalidate })
  const remove = trpc.recurringPayments.delete.useMutation({ onSuccess: invalidate })

  const cardOptions = (cards.data ?? [])
    .filter((c) => c.status === 'open')
    .map((c) => ({ value: String(c.id), label: cardLabel(c) }))

  const editor = useEntityEditor<RecurringPaymentRow, RecurringPaymentFormValue>({
    entityLabel: 'recurring payment',
    titles: { create: 'Add recurring payment', edit: (r) => `Edit ${r.name}` },
    create,
    update,
    form: (props) => <RecurringPaymentForm cardOptions={cardOptions} {...props} />
  })

  const flagged = (payments.data ?? []).filter(
    (r) => r.cardStatus === 'no_bonus' || r.cardStatus === 'bonus_done'
  ).length

  return (
    <>
      <PageHeader title="Recurring Payments">
        <Button leftSection={<IconPlus size={16} />} onClick={editor.openCreate}>
          Add payment
        </Button>
      </PageHeader>
      <Text c="dimmed" mb="md">
        Subscriptions and bills that auto-charge a card. Red flags mean the card on file isn&apos;t
        earning toward a signup bonus anymore — move those charges to a card that is.
        {flagged > 0 && (
          <Text span fw={600} c="red">
            {' '}
            {flagged} payment{flagged === 1 ? '' : 's'} could work harder.
          </Text>
        )}
      </Text>

      <QueryGate queries={[payments]}>
        <DataTable
          columns={COLUMNS}
          rows={payments.data}
          empty={{
            title: 'No recurring payments tracked',
            description:
              'Add the subscriptions and bills that auto-bill your cards, and which card each one hits.'
          }}
          rowActions={(r) => (
            <RowActionsMenu
              onEdit={() => editor.openEdit(r)}
              onDelete={() => remove.mutate({ id: r.id })}
              deleteLabel={`Delete ${r.name}?`}
            />
          )}
        />
      </QueryGate>

      {editor.element}
    </>
  )
}
