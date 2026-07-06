import React, { useState, useMemo } from 'react'
import {
  Table,
  Button,
  Checkbox,
  Chip,
  Group,
  Badge,
  NumberInput,
  Text,
  Tooltip,
  SegmentedControl
} from '@mantine/core'
import {
  IconPlus,
  IconChevronUp,
  IconChevronDown,
  IconFileTypePdf,
  IconBuildingStore
} from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { CsvImportButton } from '../components/CsvImportButton'
import { CreditReportImport } from '../components/CreditReportImport'
import { BusinessCardWizard } from '../components/BusinessCardWizard'
import { useCardEditor, cardLabel } from '../components/useCardEditor'
import { useInvalidateCards, showSuccess } from '../lib/mutations'
import { useInlineCommit } from '../lib/useInlineCommit'
import { CARD_STATUS_COLOR } from '../lib/statusColors'
import { CARD_STATUS_LABELS, CARD_FIELD_LABELS, type CardStatus } from '@shared/constants'
import { formatCents } from '@shared/format'
import { formatDate } from '@shared/dates'
import type { CardRow } from '../lib/types'

/** Product-level baseline earn rate, edited inline; feeds cash-back return in Reports. */
function EarnRateCell({
  card: c,
  onCommit
}: {
  card: CardRow
  onCommit: (productId: number, pct: number | null) => void
}): React.ReactElement {
  const current = c.product?.defaultCashbackPct ?? null
  const { value, setValue, focusProps } = useInlineCommit<number | string>(current ?? '', (v) => {
    const pct = v === '' ? null : Number(v)
    if (c.product && pct !== current) onCommit(c.product.id, pct)
  })

  if (!c.product) return <Text c="dimmed">—</Text>

  return (
    <NumberInput
      size="xs"
      w={80}
      min={0}
      step={0.25}
      decimalScale={2}
      suffix="%"
      hideControls
      aria-label="Default cash back percent"
      value={value}
      onChange={setValue}
      {...focusProps}
    />
  )
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
  const cards = trpc.cards.list.useQuery()
  const editor = useCardEditor()
  const invalidate = useInvalidateCards()

  const [status, setStatus] = useState<string>('all')
  const [needsOnly, setNeedsOnly] = useState(false)
  const [sort, setSort] = useState<Sort>({ field: 'opened', dir: 'desc' })
  const [reportOpen, setReportOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)

  const remove = trpc.cards.delete.useMutation({ onSuccess: invalidate })
  const setAutopay = trpc.cards.update.useMutation({ onSuccess: invalidate })
  const setCashback = trpc.products.update.useMutation({ onSuccess: invalidate })

  const importCsv = trpc.cards.importCsv.useMutation({
    onSuccess: (res) => {
      invalidate()
      showSuccess(`Imported ${res.total} cards (${res.created} new, ${res.updated} updated)`)
    }
  })

  const needsCount = (cards.data ?? []).filter((c) => c.missingFields.length > 0).length

  const rows = useMemo(() => {
    const all = cards.data ?? []
    const filtered = all
      .filter((c) => status === 'all' || c.status === status)
      .filter((c) => !needsOnly || c.missingFields.length > 0)
    return [...filtered].sort((a, b) => compare(value(a, sort.field), value(b, sort.field), sort.dir))
  }, [cards.data, status, needsOnly, sort])

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
        <CsvImportButton onText={(text) => importCsv.mutate({ text })} loading={importCsv.isPending} />
        <Button
          variant="default"
          leftSection={<IconFileTypePdf size={16} />}
          onClick={() => setReportOpen(true)}
        >
          Import credit report
        </Button>
        <Button
          variant="default"
          leftSection={<IconBuildingStore size={16} />}
          onClick={() => setWizardOpen(true)}
        >
          Add business card
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
            { label: 'All', value: 'all' },
            { label: 'Open', value: 'open' },
            { label: 'Closed', value: 'closed' },
            { label: 'Applied', value: 'applied' },
            { label: 'Rejected', value: 'rejected' }
          ]}
        />
        <Chip checked={needsOnly} onChange={setNeedsOnly} variant="light" color="orange">
          Needs info{needsCount > 0 ? ` (${needsCount})` : ''}
        </Chip>
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
              <Table.Th>Earn %</Table.Th>
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
                  <Badge color={CARD_STATUS_COLOR[c.status as CardStatus] ?? 'gray'} variant="light">
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
                  <EarnRateCell
                    card={c}
                    onCommit={(productId, pct) =>
                      setCashback.mutate({ id: productId, defaultCashbackPct: pct })
                    }
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

      <CreditReportImport opened={reportOpen} onClose={() => setReportOpen(false)} />
      <BusinessCardWizard opened={wizardOpen} onClose={() => setWizardOpen(false)} />
      {editor.element}
    </>
  )
}
