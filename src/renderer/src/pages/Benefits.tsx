import React, { useState, useMemo } from 'react'
import { Button, Badge, Text, Checkbox, SegmentedControl, Group, Tabs } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { BenefitForm, type BenefitFormValue } from '../components/BenefitForm'
import { CardBenefits } from './CardBenefits'
import { cardLabel, cardSelectLabel } from '../components/useCardEditor'
import { formatCents, formatDate, daysUntil } from '@shared/format'
import type { BenefitRow } from '../lib/types'

type StatusFilter = 'all' | 'available' | 'upcoming' | 'used' | 'expired'

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  available: { color: 'green', label: 'Available' },
  upcoming: { color: 'blue', label: 'Upcoming' },
  used: { color: 'gray', label: 'Used' },
  expired: { color: 'red', label: 'Expired' }
}

export function Benefits(): React.ReactElement {
  const utils = trpc.useUtils()
  const benefits = trpc.benefits.list.useQuery()
  const cards = trpc.cards.list.useQuery()
  const [filter, setFilter] = useState<StatusFilter>('all')

  const invalidate = (): void => void utils.benefits.list.invalidate()

  const create = trpc.benefits.create.useMutation({ onSuccess: invalidate })
  const update = trpc.benefits.update.useMutation({ onSuccess: invalidate })
  const setUsed = trpc.benefits.setUsed.useMutation({ onSuccess: invalidate })
  const remove = trpc.benefits.delete.useMutation({ onSuccess: invalidate })

  const cardOptions = (cards.data ?? []).map((c) => ({ value: String(c.id), label: cardSelectLabel(c) }))

  const filtered = useMemo(() => {
    const rows = benefits.data ?? []
    if (filter === 'all') return rows
    return rows.filter((b) => b.status === filter)
  }, [benefits.data, filter])

  const editor = useEntityEditor<BenefitRow, BenefitFormValue>({
    entityLabel: 'benefit',
    container: 'drawer',
    create,
    update,
    form: ({ initial, submitting, onSubmit, onCancel }) => (
      <BenefitForm
        initial={initial ?? undefined}
        cardOptions={cardOptions}
        submitting={submitting}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )
  })

  // The "Used" checkbox mutates directly from the row, so it lives here rather
  // than in the editor.
  const columns: Column<BenefitRow>[] = [
    {
      header: 'Used',
      w: 40,
      render: (b) => (
        <Checkbox
          checked={b.used}
          onChange={(e) => setUsed.mutate({ id: b.id, used: e.currentTarget.checked })}
        />
      )
    },
    {
      header: 'Benefit',
      render: (b) => (
        <>
          <Text fw={500}>{b.name}</Text>
          <Group gap={6}>
            {b.category && (
              <Text size="xs" c="dimmed">
                {b.category}
              </Text>
            )}
            {b.isSubscription && (
              <Badge size="xs" variant="light" color="grape">
                Subscription
              </Badge>
            )}
          </Group>
        </>
      )
    },
    {
      header: 'Card',
      render: (b) =>
        b.card ? (
          <>
            <Text size="sm">{cardLabel(b.card)}</Text>
            {b.card.last4 && (
              <Text size="xs" c="dimmed">
                ····{b.card.last4}
              </Text>
            )}
          </>
        ) : (
          '—'
        )
    },
    {
      header: 'Value',
      render: (b) => (
        <>
          <Text size="sm">{formatCents(b.amountCents)}</Text>
          {b.valuePct != null && b.amountCents != null && (
            <Text size="xs" c="dimmed">
              ≈ {formatCents(Math.round((b.amountCents * b.valuePct) / 100))} to you
            </Text>
          )}
        </>
      )
    },
    {
      header: 'Use by',
      render: (b) => {
        const days = daysUntil(b.useBy)
        return (
          <>
            <Text size="sm">{formatDate(b.useBy)}</Text>
            {days != null && b.status === 'available' && days <= 30 && (
              <Text size="xs" c={days < 7 ? 'red' : 'orange'}>
                {days < 0 ? 'expired' : `${days}d left`}
              </Text>
            )}
          </>
        )
      }
    },
    {
      header: 'Status',
      render: (b) => (
        <Badge color={STATUS_BADGE[b.status]?.color ?? 'gray'} variant="light">
          {STATUS_BADGE[b.status]?.label ?? b.status}
        </Badge>
      )
    }
  ]

  return (
    <>
      <PageHeader title="Benefits" />
      <Tabs defaultValue="mine">
        <Tabs.List mb="md">
          <Tabs.Tab value="mine">My benefits</Tabs.Tab>
          <Tabs.Tab value="card">Card benefits</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="card">
          <CardBenefits />
        </Tabs.Panel>

        <Tabs.Panel value="mine">
          <Group justify="space-between" mb="md">
            <SegmentedControl
              value={filter}
              onChange={(v) => setFilter(v as StatusFilter)}
              data={[
                { label: 'All', value: 'all' },
                { label: 'Available', value: 'available' },
                { label: 'Upcoming', value: 'upcoming' },
                { label: 'Used', value: 'used' },
                { label: 'Expired', value: 'expired' }
              ]}
            />
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={editor.openCreate}
              disabled={(cards.data ?? []).length === 0}
            >
              Add benefit
            </Button>
          </Group>

          <QueryGate queries={[benefits, cards]}>
            {(cards.data ?? []).length === 0 ? (
              <EmptyState title="Add a card first" description="Benefits attach to a card." />
            ) : (
              <DataTable
                columns={columns}
                rows={filtered}
                verticalSpacing="sm"
                empty={{
                  title: benefits.data?.length ? 'Nothing in this view' : 'No benefits tracked',
                  description: benefits.data?.length
                    ? 'Try a different filter.'
                    : 'Add recurring credits like dining, travel, or subscription perks.'
                }}
                rowActions={(b) => (
                  <RowActionsMenu
                    onEdit={() => editor.openEdit(b)}
                    onDelete={() => remove.mutate({ id: b.id })}
                    deleteLabel={`Delete ${b.name}?`}
                  />
                )}
              />
            )}
          </QueryGate>
        </Tabs.Panel>
      </Tabs>

      {editor.element}
    </>
  )
}
