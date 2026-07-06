import React, { useState, useMemo } from 'react'
import {
  Button,
  Badge,
  Menu,
  Text,
  TextInput,
  Checkbox,
  SegmentedControl,
  Group,
  Tabs
} from '@mantine/core'
import { IconPlus, IconSearch, IconCopy } from '@tabler/icons-react'
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
import { centsToDollars, parseCents, formatCents } from '@shared/format'
import { formatDate, daysUntil } from '@shared/dates'
import type { BenefitRow } from '../lib/types'
import { NumberInput } from '@mantine/core'

/** Full-used checkbox plus inline partial amount ("$65 of the $150 credit"). */
function UsedCell({
  b,
  onToggle,
  onAmount
}: {
  b: BenefitRow
  onToggle: (used: boolean) => void
  onAmount: (usedAmountCents: number | null) => void
}): React.ReactElement {
  const [value, setValue] = React.useState<number | string>(centsToDollars(b.usedAmountCents))
  const focused = React.useRef(false)

  React.useEffect(() => {
    if (!focused.current) setValue(centsToDollars(b.usedAmountCents))
  }, [b.usedAmountCents])

  const commit = (): void => {
    focused.current = false
    const cents = value === '' ? null : parseCents(value)
    if (cents !== (b.usedAmountCents ?? null)) onAmount(cents)
  }

  return (
    <Group gap={6} wrap="nowrap">
      <Checkbox
        checked={b.used}
        onChange={(e) => onToggle(e.currentTarget.checked)}
        aria-label="Fully used"
      />
      <NumberInput
        size="xs"
        w={90}
        min={0}
        decimalScale={2}
        prefix="$"
        hideControls
        placeholder="partial"
        aria-label="Amount used so far"
        value={value}
        onChange={setValue}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </Group>
  )
}

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
  const [search, setSearch] = useState('')

  const invalidate = (): void => void utils.benefits.list.invalidate()

  const create = trpc.benefits.create.useMutation({ onSuccess: invalidate })
  const update = trpc.benefits.update.useMutation({ onSuccess: invalidate })
  const setUsed = trpc.benefits.setUsed.useMutation({ onSuccess: invalidate })
  const setUsedAmount = trpc.benefits.setUsedAmount.useMutation({ onSuccess: invalidate })
  const remove = trpc.benefits.delete.useMutation({ onSuccess: invalidate })

  const cardOptions = (cards.data ?? []).map((c) => ({ value: String(c.id), label: cardSelectLabel(c) }))

  const filtered = useMemo(() => {
    let rows = benefits.data ?? []
    if (filter !== 'all') rows = rows.filter((b) => b.status === filter)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((b) =>
        [b.name, b.category, b.notes, b.card ? cardLabel(b.card) : '', b.card?.last4]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q))
      )
    }
    return rows
  }, [benefits.data, filter, search])

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
      w: 150,
      render: (b) => (
        <UsedCell
          b={b}
          onToggle={(used) => setUsed.mutate({ id: b.id, used })}
          onAmount={(usedAmountCents) => setUsedAmount.mutate({ id: b.id, usedAmountCents })}
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
          {b.usedAmountCents != null && !b.used && (
            <Text size="xs" c="teal">
              {formatCents(b.usedAmountCents)} used
            </Text>
          )}
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
            <Group gap="sm">
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
              <TextInput
                placeholder="Search benefits…"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                w={220}
              />
            </Group>
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
                    ? 'Try a different filter or search.'
                    : 'Add recurring credits like dining, travel, or subscription perks.'
                }}
                rowActions={(b) => (
                  <RowActionsMenu
                    onEdit={() => editor.openEdit(b)}
                    onDelete={() => remove.mutate({ id: b.id })}
                    deleteLabel={`Delete ${b.name}?`}
                    extraItems={
                      <Menu.Item
                        leftSection={<IconCopy size={16} />}
                        onClick={() => editor.openCopy(b)}
                      >
                        Duplicate
                      </Menu.Item>
                    }
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
