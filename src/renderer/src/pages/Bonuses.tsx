import React, { useEffect, useRef, useState } from 'react'
import { Button, Badge, NumberInput, Text, Progress, Stack, Group, Tabs } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { BonusForm, type BonusFormValue } from '../components/BonusForm'
import { AvailableOffers } from './AvailableOffers'
import { cardLabel } from '../components/useCardEditor'
import {
  centsToDollars,
  parseCents,
  formatCents,
  formatPoints,
  formatDate,
  daysUntil
} from '@shared/format'
import type { BonusRow } from '../lib/types'

function rewardText(b: BonusRow): string {
  if (b.cashAmountCents != null) return formatCents(b.cashAmountCents)
  if (b.pointsAmount != null) {
    return `${formatPoints(b.pointsAmount)} ${b.pointProgram?.name ?? 'pts'}`
  }
  return '—'
}

/** Spend-so-far edited right in the table; Enter or blur commits. */
function SpendCell({
  bonus,
  onCommit
}: {
  bonus: BonusRow
  onCommit: (bonus: BonusRow, spendSoFarCents: number) => void
}): React.ReactElement {
  const [value, setValue] = useState<number | string>(centsToDollars(bonus.spendSoFarCents) || 0)
  const focused = useRef(false)

  // Pick up outside changes (drawer edit, refetch) unless the user is typing.
  useEffect(() => {
    if (!focused.current) setValue(centsToDollars(bonus.spendSoFarCents) || 0)
  }, [bonus.spendSoFarCents])

  const commit = (): void => {
    focused.current = false
    const cents = parseCents(value) ?? 0
    if (cents !== bonus.spendSoFarCents) onCommit(bonus, cents)
  }

  const pct =
    bonus.targetSpendCents && bonus.targetSpendCents > 0
      ? Math.min(100, (bonus.spendSoFarCents / bonus.targetSpendCents) * 100)
      : 0

  return (
    <Stack gap={4}>
      {bonus.targetSpendCents != null && (
        <Progress value={pct} color={bonus.spendMet ? 'green' : 'blue'} size="sm" />
      )}
      <Group gap={6} wrap="nowrap">
        <NumberInput
          size="xs"
          w={110}
          min={0}
          decimalScale={2}
          thousandSeparator=","
          prefix="$"
          hideControls
          aria-label="Spent so far"
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
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {bonus.targetSpendCents != null ? (
            <>
              / {formatCents(bonus.targetSpendCents)}
              {!bonus.spendMet && bonus.remainingSpendCents != null
                ? ` · ${formatCents(bonus.remainingSpendCents)} to go`
                : ''}
            </>
          ) : (
            'spent'
          )}
        </Text>
      </Group>
    </Stack>
  )
}

const STATIC_COLUMNS: Column<BonusRow>[] = [
  { header: 'Card', render: (b) => <Text fw={500}>{b.card ? cardLabel(b.card) : '—'}</Text> },
  { header: 'Reward', render: rewardText },
  { header: 'Value', render: (b) => <Text fw={600}>{formatCents(b.valueCents)}</Text> }
]

const TRAILING_COLUMNS: Column<BonusRow>[] = [
  {
    header: 'Deadline',
    render: (b) => {
      const days = daysUntil(b.deadline)
      return (
        <>
          <Text size="sm">{formatDate(b.deadline)}</Text>
          {days != null && !b.received && (
            <Text size="xs" c={days < 0 ? 'red' : days < 14 ? 'orange' : 'dimmed'}>
              {days < 0 ? `${-days}d overdue` : `${days}d left`}
            </Text>
          )}
        </>
      )
    }
  },
  {
    header: 'Status',
    render: (b) =>
      b.received ? (
        <Badge color="green" variant="light">
          Received
        </Badge>
      ) : b.spendMet ? (
        <Badge color="teal" variant="light">
          Spend met
        </Badge>
      ) : (
        <Badge color="blue" variant="light">
          In progress
        </Badge>
      )
  }
]

export function Bonuses(): React.ReactElement {
  const utils = trpc.useUtils()
  const bonuses = trpc.bonuses.list.useQuery()
  const cards = trpc.cards.list.useQuery()
  const programs = trpc.points.listForSelect.useQuery()

  const invalidate = (): void => void utils.bonuses.list.invalidate()

  const create = trpc.bonuses.create.useMutation({ onSuccess: invalidate })
  const update = trpc.bonuses.update.useMutation({ onSuccess: invalidate })
  const remove = trpc.bonuses.delete.useMutation({ onSuccess: invalidate })

  const cardOptions = (cards.data ?? []).map((c) => ({ value: String(c.id), label: cardLabel(c) }))
  const programOptions = (programs.data ?? []).map((p) => ({
    value: String(p.id),
    label: p.label,
    valuationCpp: p.valuationCpp
  }))

  const editor = useEntityEditor<BonusRow, BonusFormValue>({
    entityLabel: 'bonus',
    container: 'drawer',
    create,
    update,
    form: ({ initial, submitting, onSubmit, onCancel }) => (
      <BonusForm
        initial={initial ?? undefined}
        cardOptions={cardOptions}
        programOptions={programOptions}
        submitting={submitting}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )
  })

  const columns: Column<BonusRow>[] = [
    ...STATIC_COLUMNS,
    {
      header: 'Min spend',
      miw: 230,
      render: (b) => (
        <SpendCell
          bonus={b}
          onCommit={(bonus, spendSoFarCents) => update.mutate({ id: bonus.id, spendSoFarCents })}
        />
      )
    },
    ...TRAILING_COLUMNS
  ]

  return (
    <>
      <PageHeader title="Signup Bonuses" />
      <Tabs defaultValue="mine">
        <Tabs.List mb="md">
          <Tabs.Tab value="mine">My cards</Tabs.Tab>
          <Tabs.Tab value="available">Available offers</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="available">
          <AvailableOffers />
        </Tabs.Panel>

        <Tabs.Panel value="mine">
          <Group justify="space-between" mb="md">
            <Text c="dimmed" size="sm">
              Signup bonuses you&apos;re actively working on your cards.
            </Text>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={editor.openCreate}
              disabled={(cards.data ?? []).length === 0}
            >
              Add bonus
            </Button>
          </Group>

          <QueryGate queries={[bonuses, cards]}>
            {(cards.data ?? []).length === 0 ? (
              <EmptyState title="Add a card first" description="Signup bonuses attach to a card." />
            ) : (
              <DataTable
                columns={columns}
                rows={bonuses.data}
                verticalSpacing="sm"
                empty={{
                  title: 'No bonuses tracked',
                  description: 'Add a signup bonus with its spend target and deadline.'
                }}
                rowActions={(b) => (
                  <RowActionsMenu
                    onEdit={() => editor.openEdit(b)}
                    onDelete={() => remove.mutate({ id: b.id })}
                    deleteLabel="Delete this bonus?"
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
