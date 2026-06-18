import React, { useState, useMemo } from 'react'
import {
  Table,
  Button,
  Drawer,
  ActionIcon,
  Menu,
  Badge,
  Text,
  Checkbox,
  SegmentedControl,
  Group,
  Tabs
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconDots, IconEdit, IconTrash } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { BenefitForm, type BenefitFormValue } from '../components/BenefitForm'
import { CardBenefits } from './CardBenefits'
import { cardLabel } from '../components/useCardEditor'
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
  const [opened, setOpened] = useState(false)
  const [editing, setEditing] = useState<BenefitRow | null>(null)

  const invalidate = (): void => void utils.benefits.list.invalidate()
  const onError = (e: { message: string }): void => {
    notifications.show({ color: 'red', message: e.message })
  }

  const create = trpc.benefits.create.useMutation({ onSuccess: invalidate, onError })
  const update = trpc.benefits.update.useMutation({ onSuccess: invalidate, onError })
  const setUsed = trpc.benefits.setUsed.useMutation({ onSuccess: invalidate, onError })
  const remove = trpc.benefits.delete.useMutation({ onSuccess: invalidate, onError })

  const cardOptions = (cards.data ?? []).map((c) => ({ value: String(c.id), label: cardLabel(c) }))

  const filtered = useMemo(() => {
    const rows = benefits.data ?? []
    if (filter === 'all') return rows
    return rows.filter((b) => b.status === filter)
  }, [benefits.data, filter])

  const openCreate = (): void => {
    setEditing(null)
    setOpened(true)
  }
  const openEdit = (b: BenefitRow): void => {
    setEditing(b)
    setOpened(true)
  }

  const submit = (value: BenefitFormValue): void => {
    const opts = {
      onSuccess: () => {
        setOpened(false)
        notifications.show({ message: editing ? 'Benefit updated' : 'Benefit added' })
      }
    }
    if (editing) update.mutate({ id: editing.id, ...value }, opts)
    else create.mutate(value, opts)
  }

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
              onClick={openCreate}
              disabled={(cards.data ?? []).length === 0}
            >
              Add benefit
            </Button>
          </Group>

          {(cards.data ?? []).length === 0 ? (
            <EmptyState title="Add a card first" description="Benefits attach to a card." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={benefits.data?.length ? 'Nothing in this view' : 'No benefits tracked'}
          description={
            benefits.data?.length
              ? 'Try a different filter.'
              : 'Add recurring credits like dining, travel, or subscription perks.'
          }
        />
      ) : (
        <Table highlightOnHover withTableBorder verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40}>Used</Table.Th>
              <Table.Th>Benefit</Table.Th>
              <Table.Th>Card</Table.Th>
              <Table.Th>Value</Table.Th>
              <Table.Th>Use by</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filtered.map((b) => {
              const days = daysUntil(b.useBy)
              return (
                <Table.Tr key={b.id}>
                  <Table.Td>
                    <Checkbox
                      checked={b.used}
                      onChange={(e) => setUsed.mutate({ id: b.id, used: e.currentTarget.checked })}
                    />
                  </Table.Td>
                  <Table.Td>
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
                  </Table.Td>
                  <Table.Td>{b.card ? cardLabel(b.card) : '—'}</Table.Td>
                  <Table.Td>{formatCents(b.amountCents)}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(b.useBy)}</Text>
                    {days != null && b.status === 'available' && days <= 30 && (
                      <Text size="xs" c={days < 7 ? 'red' : 'orange'}>
                        {days < 0 ? 'expired' : `${days}d left`}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_BADGE[b.status]?.color ?? 'gray'} variant="light">
                      {STATUS_BADGE[b.status]?.label ?? b.status}
                    </Badge>
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
                            if (window.confirm(`Delete ${b.name}?`)) remove.mutate({ id: b.id })
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
        title={editing ? 'Edit benefit' : 'Add benefit'}
      >
        {opened && (
          <BenefitForm
            initial={editing ? (editing as unknown as Partial<BenefitFormValue>) : undefined}
            cardOptions={cardOptions}
            submitting={create.isPending || update.isPending}
            onSubmit={submit}
            onCancel={() => setOpened(false)}
          />
        )}
      </Drawer>
    </>
  )
}
