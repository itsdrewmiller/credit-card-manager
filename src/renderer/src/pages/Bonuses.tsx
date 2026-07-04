import React from 'react'
import { Button, Badge, Text, Progress, Stack, Group, Tabs } from '@mantine/core'
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
import { formatCents, formatPoints, formatDate, daysUntil } from '@shared/format'
import type { BonusRow } from '../lib/types'

function rewardText(b: BonusRow): string {
  if (b.cashAmountCents != null) return formatCents(b.cashAmountCents)
  if (b.pointsAmount != null) {
    return `${formatPoints(b.pointsAmount)} ${b.pointProgram?.name ?? 'pts'}`
  }
  return '—'
}

const COLUMNS: Column<BonusRow>[] = [
  { header: 'Card', render: (b) => <Text fw={500}>{b.card ? cardLabel(b.card) : '—'}</Text> },
  { header: 'Reward', render: rewardText },
  { header: 'Value', render: (b) => <Text fw={600}>{formatCents(b.valueCents)}</Text> },
  {
    header: 'Min spend',
    miw: 200,
    render: (b) => {
      const pct =
        b.targetSpendCents && b.targetSpendCents > 0
          ? Math.min(100, (b.spendSoFarCents / b.targetSpendCents) * 100)
          : 0
      return b.targetSpendCents ? (
        <Stack gap={2}>
          <Progress value={pct} color={b.spendMet ? 'green' : 'blue'} size="sm" />
          <Text size="xs" c="dimmed">
            {formatCents(b.spendSoFarCents)} / {formatCents(b.targetSpendCents)}
            {!b.spendMet && b.remainingSpendCents != null
              ? ` · ${formatCents(b.remainingSpendCents)} to go`
              : ''}
          </Text>
        </Stack>
      ) : (
        <Text c="dimmed">—</Text>
      )
    }
  },
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
                columns={COLUMNS}
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
