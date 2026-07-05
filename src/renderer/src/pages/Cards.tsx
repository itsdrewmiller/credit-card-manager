import React, { useState, useMemo } from 'react'
import {
  Table,
  Button,
  Checkbox,
  Group,
  Badge,
  Text,
  Tooltip,
  SegmentedControl,
  FileButton
} from '@mantine/core'
import { IconPlus, IconChevronUp, IconChevronDown, IconUpload } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useCardEditor, cardLabel } from '../components/useCardEditor'
import { useInvalidateCards, showSuccess } from '../lib/mutations'
import { CARD_STATUS_LABELS, CARD_FIELD_LABELS, type CardStatus } from '@shared/constants'
import { formatCents, formatDate } from '@shared/format'
import { readTextFile } from '../lib/download'
import type { CardRow } from '../lib/types'

const STATUS_COLOR: Record<CardStatus, string> = {
  applied: 'blue',
  open: 'green',
  closed: 'gray',
  product_changed: 'grape',
  rejected: 'red'
}

type SortField = 'card' | 'owner' | 'business' | 'status' | 'fee' | 'opened'
interface Sort {
  field: SortField
  dir: 'asc' | 'desc'
}

function value(c: CardRow, field: SortField): string | number | null {
  switch (field) {
    case 'card':
      return cardLabel(c).toLowerCase()
    case 'owner':
      return c.owner?.name?.toLowerCase() ?? null
    case 'business':
      return c.business?.name?.toLowerCase() ?? null
    case 'status':
      return c.status
    case 'fee':
      return c.annualFeeCents ?? null
    case 'opened':
      return c.openedDate ?? null
  }
}

function compare(a: string | number | null, b: string | number | null, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0
  if (a == null) return 1 // nulls last regardless of direction
  if (b == null) return -1
  const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
  return dir === 'asc' ? r : -r
}

export function Cards(): React.ReactElement {
  const navigate = useNavigate()
  const cards = trpc.cards.list.useQuery()
  const editor = useCardEditor()
  const invalidate = useInvalidateCards()

  const [status, setStatus] = useState<string>('open')
  const [sort, setSort] = useState<Sort>({ field: 'opened', dir: 'desc' })

  const remove = trpc.cards.delete.useMutation({ onSuccess: invalidate })
  const setAutopay = trpc.cards.update.useMutation({ onSuccess: invalidate })

  const importCsv = trpc.cards.importCsv.useMutation({
    onSuccess: (res) => {
      invalidate()
      showSuccess(`Imported ${res.total} cards (${res.created} new, ${res.updated} updated)`)
    }
  })

  const onPickFile = async (file: File | null): Promise<void> => {
    if (!file) return
    importCsv.mutate({ text: await readTextFile(file) })
  }

  const rows = useMemo(() => {
    const all = cards.data ?? []
    const filtered = status === 'all' ? all : all.filter((c) => c.status === status)
    return [...filtered].sort((a, b) => compare(value(a, sort.field), value(b, sort.field), sort.dir))
  }, [cards.data, status, sort])

  const toggleSort = (field: SortField): void =>
    setSort((s) => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' }))

  const Th = ({ field, label }: { field: SortField; label: string }): React.ReactElement => (
    <Table.Th style={{ cursor: 'pointer' }} onClick={() => toggleSort(field)}>
      <Group gap={4} wrap="nowrap">
        {label}
        {sort.field === field &&
          (sort.dir === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />)}
      </Group>
    </Table.Th>
  )

  return (
    <>
      <PageHeader title="Cards">
        <FileButton onChange={onPickFile} accept="text/csv,.csv">
          {(props) => (
            <Button
              {...props}
              variant="default"
              leftSection={<IconUpload size={16} />}
              loading={importCsv.isPending}
            >
              Import CSV
            </Button>
          )}
        </FileButton>
        <Button variant="default" onClick={() => navigate('/add-cards')}>
          Add cards…
        </Button>
        <Button leftSection={<IconPlus size={16} />} onClick={editor.openCreate}>
          Add card
        </Button>
      </PageHeader>

      <Group mb="md">
        <SegmentedControl
          value={status}
          onChange={setStatus}
          data={[
            { label: 'Open', value: 'open' },
            { label: 'Closed', value: 'closed' },
            { label: 'Applied', value: 'applied' },
            { label: 'Rejected', value: 'rejected' },
            { label: 'All', value: 'all' }
          ]}
        />
        <Text size="sm" c="dimmed">
          {rows.length} card{rows.length === 1 ? '' : 's'}
        </Text>
      </Group>

      <QueryGate queries={[cards]}>
      {cards.data && cards.data.length === 0 ? (
        <EmptyState
          title="No cards yet"
          description="Add cards manually, or import a credit report to bootstrap them."
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No cards in this view" description="Try a different status filter." />
      ) : (
        <Table highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Th field="card" label="Card" />
              <Th field="owner" label="Owner" />
              <Th field="business" label="Business" />
              <Th field="status" label="Status" />
              <Th field="fee" label="Annual fee" />
              <Th field="opened" label="Opened" />
              <Table.Th>Autopay</Table.Th>
              <Table.Th>Needs info</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((c: CardRow) => (
              <Table.Tr key={c.id}>
                <Table.Td>
                  <Text fw={500}>{cardLabel(c)}</Text>
                  {c.last4 && (
                    <Text size="xs" c="dimmed">
                      ····{c.last4}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{c.owner?.name ?? <Text c="dimmed">—</Text>}</Table.Td>
                <Table.Td>
                  {c.business ? c.business.name : <Text c="dimmed">Personal</Text>}
                </Table.Td>
                <Table.Td>
                  <Badge color={STATUS_COLOR[c.status as CardStatus] ?? 'gray'} variant="light">
                    {CARD_STATUS_LABELS[c.status as CardStatus] ?? c.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatCents(c.annualFeeCents)}</Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDate(c.openedDate)}</Text>
                  {c.closedDate && (
                    <Text size="xs" c="dimmed">
                      closed {formatDate(c.closedDate)}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Checkbox
                    checked={c.autopay}
                    onChange={(e) => setAutopay.mutate({ id: c.id, autopay: e.currentTarget.checked })}
                    aria-label="Automatic payments set up"
                  />
                </Table.Td>
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
                  <RowActionsMenu
                    onEdit={() => editor.openEdit(c)}
                    onDelete={() => remove.mutate({ id: c.id })}
                    deleteLabel={`Delete ${cardLabel(c)}?`}
                  />
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
