import React from 'react'
import { Table, Button, Group, Badge, Text } from '@mantine/core'
import { IconEdit } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { useCardEditor, cardLabel } from '../components/useCardEditor'
import { CARD_FIELD_LABELS } from '@shared/constants'
import type { CardRow } from '../lib/types'

export function NeedsInfo(): React.ReactElement {
  const needs = trpc.cards.needsInfo.useQuery()
  const editor = useCardEditor()

  return (
    <>
      <PageHeader title="Needs info" badge={needs.data ? String(needs.data.length) : undefined} />
      <Text c="dimmed" mb="md">
        Live cards missing churning-critical details. Fill these in to keep value, velocity, and
        renewal tracking accurate.
      </Text>

      <QueryGate queries={[needs]}>
      {needs.data && needs.data.length === 0 ? (
        <EmptyState title="All caught up" description="Every open card has the info it needs." />
      ) : (
        <Table highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Card</Table.Th>
              <Table.Th>Owner</Table.Th>
              <Table.Th>Missing</Table.Th>
              <Table.Th w={120} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {needs.data?.map((c: CardRow) => (
              <Table.Tr key={c.id}>
                <Table.Td fw={500}>{cardLabel(c)}</Table.Td>
                <Table.Td>{c.owner?.name ?? <Text c="dimmed">—</Text>}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {c.missingFields.map((f) => (
                      <Badge key={f} color="orange" variant="light">
                        {CARD_FIELD_LABELS[f]}
                      </Badge>
                    ))}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconEdit size={14} />}
                    onClick={() => editor.openEdit(c)}
                  >
                    Fill in
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      </QueryGate>

      {editor.element}
    </>
  )
}
