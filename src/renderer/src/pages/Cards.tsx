import React from 'react'
import { Table, Button, Group, ActionIcon, Menu, Badge, Text, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconDots, IconEdit, IconTrash } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { useCardEditor, cardLabel } from '../components/useCardEditor'
import { CARD_STATUS_LABELS, CARD_FIELD_LABELS, type CardStatus } from '@shared/constants'
import { formatCents, formatDate } from '@shared/format'
import type { CardRow } from '../lib/types'

const STATUS_COLOR: Record<CardStatus, string> = {
  applied: 'blue',
  open: 'green',
  closed: 'gray',
  product_changed: 'grape',
  rejected: 'red'
}

export function Cards(): React.ReactElement {
  const utils = trpc.useUtils()
  const cards = trpc.cards.list.useQuery()
  const editor = useCardEditor()

  const remove = trpc.cards.delete.useMutation({
    onSuccess: () => {
      void utils.cards.list.invalidate()
      void utils.cards.needsInfo.invalidate()
      void utils.system.health.invalidate()
    },
    onError: (e) => notifications.show({ color: 'red', message: e.message })
  })

  return (
    <>
      <PageHeader title="Cards">
        <Button leftSection={<IconPlus size={16} />} onClick={editor.openCreate}>
          Add card
        </Button>
      </PageHeader>

      {cards.data && cards.data.length === 0 ? (
        <EmptyState
          title="No cards yet"
          description="Add cards manually, or import a credit report later to bootstrap them."
        />
      ) : (
        <Table highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Card</Table.Th>
              <Table.Th>Owner</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Annual fee</Table.Th>
              <Table.Th>Opened</Table.Th>
              <Table.Th>Needs info</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cards.data?.map((c: CardRow) => (
              <Table.Tr key={c.id}>
                <Table.Td>
                  <Text fw={500}>{cardLabel(c)}</Text>
                  {c.business && (
                    <Text size="xs" c="dimmed">
                      {c.business.name}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{c.owner?.name ?? <Text c="dimmed">—</Text>}</Table.Td>
                <Table.Td>
                  <Badge color={STATUS_COLOR[c.status as CardStatus] ?? 'gray'} variant="light">
                    {CARD_STATUS_LABELS[c.status as CardStatus] ?? c.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatCents(c.annualFeeCents)}</Table.Td>
                <Table.Td>{formatDate(c.openedDate)}</Table.Td>
                <Table.Td>
                  {c.missingFields.length === 0 ? (
                    <Badge color="green" variant="light">
                      Complete
                    </Badge>
                  ) : (
                    <Tooltip
                      label={c.missingFields.map((f) => CARD_FIELD_LABELS[f]).join(', ')}
                      withArrow
                    >
                      <Badge color="orange" variant="light">
                        {c.missingFields.length} missing
                      </Badge>
                    </Tooltip>
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
                      <Menu.Item
                        leftSection={<IconEdit size={16} />}
                        onClick={() => editor.openEdit(c)}
                      >
                        Edit
                      </Menu.Item>
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={16} />}
                        onClick={() => {
                          if (window.confirm(`Delete ${cardLabel(c)}?`)) remove.mutate({ id: c.id })
                        }}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {editor.element}
    </>
  )
}
