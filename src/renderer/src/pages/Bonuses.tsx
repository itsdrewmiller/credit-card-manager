import React, { useState } from 'react'
import {
  Table,
  Button,
  Drawer,
  ActionIcon,
  Menu,
  Badge,
  Text,
  Progress,
  Stack,
  Group,
  Tabs
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconDots, IconEdit, IconTrash } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
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

export function Bonuses(): React.ReactElement {
  const utils = trpc.useUtils()
  const bonuses = trpc.bonuses.list.useQuery()
  const cards = trpc.cards.list.useQuery()
  const programs = trpc.points.listForSelect.useQuery()

  const [opened, setOpened] = useState(false)
  const [editing, setEditing] = useState<BonusRow | null>(null)

  const invalidate = (): void => void utils.bonuses.list.invalidate()
  const onError = (e: { message: string }): void => {
    notifications.show({ color: 'red', message: e.message })
  }

  const create = trpc.bonuses.create.useMutation({ onSuccess: invalidate, onError })
  const update = trpc.bonuses.update.useMutation({ onSuccess: invalidate, onError })
  const remove = trpc.bonuses.delete.useMutation({ onSuccess: invalidate, onError })

  const cardOptions = (cards.data ?? []).map((c) => ({ value: String(c.id), label: cardLabel(c) }))
  const programOptions = (programs.data ?? []).map((p) => ({
    value: String(p.id),
    label: p.label,
    valuationCpp: p.valuationCpp
  }))

  const openCreate = (): void => {
    setEditing(null)
    setOpened(true)
  }
  const openEdit = (b: BonusRow): void => {
    setEditing(b)
    setOpened(true)
  }

  const submit = (value: BonusFormValue): void => {
    const opts = {
      onSuccess: () => {
        setOpened(false)
        notifications.show({ message: editing ? 'Bonus updated' : 'Bonus added' })
      }
    }
    if (editing) update.mutate({ id: editing.id, ...value }, opts)
    else create.mutate(value, opts)
  }

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
              onClick={openCreate}
              disabled={(cards.data ?? []).length === 0}
            >
              Add bonus
            </Button>
          </Group>

          {(cards.data ?? []).length === 0 ? (
        <EmptyState title="Add a card first" description="Signup bonuses attach to a card." />
      ) : bonuses.data && bonuses.data.length === 0 ? (
        <EmptyState
          title="No bonuses tracked"
          description="Add a signup bonus with its spend target and deadline."
        />
      ) : (
        <Table highlightOnHover withTableBorder verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Card</Table.Th>
              <Table.Th>Reward</Table.Th>
              <Table.Th>Value</Table.Th>
              <Table.Th miw={200}>Min spend</Table.Th>
              <Table.Th>Deadline</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bonuses.data?.map((b) => {
              const pct =
                b.targetSpendCents && b.targetSpendCents > 0
                  ? Math.min(100, (b.spendSoFarCents / b.targetSpendCents) * 100)
                  : 0
              const days = daysUntil(b.deadline)
              return (
                <Table.Tr key={b.id}>
                  <Table.Td fw={500}>{b.card ? cardLabel(b.card) : '—'}</Table.Td>
                  <Table.Td>{rewardText(b)}</Table.Td>
                  <Table.Td fw={600}>{formatCents(b.valueCents)}</Table.Td>
                  <Table.Td>
                    {b.targetSpendCents ? (
                      <Stack gap={2}>
                        <Progress
                          value={pct}
                          color={b.spendMet ? 'green' : 'blue'}
                          size="sm"
                        />
                        <Text size="xs" c="dimmed">
                          {formatCents(b.spendSoFarCents)} / {formatCents(b.targetSpendCents)}
                          {!b.spendMet && b.remainingSpendCents != null
                            ? ` · ${formatCents(b.remainingSpendCents)} to go`
                            : ''}
                        </Text>
                      </Stack>
                    ) : (
                      <Text c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(b.deadline)}</Text>
                    {days != null && !b.received && (
                      <Text size="xs" c={days < 0 ? 'red' : days < 14 ? 'orange' : 'dimmed'}>
                        {days < 0 ? `${-days}d overdue` : `${days}d left`}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {b.received ? (
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
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray">
                          <IconDots size={18} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => openEdit(b)}>
                          Edit
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={16} />}
                          onClick={() => {
                            if (window.confirm('Delete this bonus?')) remove.mutate({ id: b.id })
                          }}
                        >
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
          )}
        </Tabs.Panel>
      </Tabs>

      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="right"
        size="lg"
        title={editing ? 'Edit bonus' : 'Add bonus'}
      >
        {opened && (
          <BonusForm
            initial={editing ? (editing as unknown as Partial<BonusFormValue>) : undefined}
            cardOptions={cardOptions}
            programOptions={programOptions}
            submitting={create.isPending || update.isPending}
            onSubmit={submit}
            onCancel={() => setOpened(false)}
          />
        )}
      </Drawer>
    </>
  )
}
