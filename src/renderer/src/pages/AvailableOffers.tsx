import React from 'react'
import { Button, Group, Text, FileButton } from '@mantine/core'
import { IconPlus, IconUpload } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { QueryGate } from '../components/QueryGate'
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { OfferForm, type OfferFormValue } from '../components/OfferForm'
import { formatCents, formatPoints } from '@shared/format'
import { formatDate } from '@shared/dates'
import { showSuccess } from '../lib/mutations'
import { readTextFile } from '../lib/download'
import type { OfferRow } from '../lib/types'

const COLUMNS: Column<OfferRow>[] = [
  {
    header: 'Card',
    render: (o) => (
      <Text fw={500}>
        {o.product ? `${o.product.issuer?.name ?? ''} ${o.product.name}`.trim() : '—'}
      </Text>
    )
  },
  {
    header: 'Reward',
    render: (o) =>
      o.cashAmountCents != null
        ? formatCents(o.cashAmountCents)
        : o.pointsAmount != null
          ? `${formatPoints(o.pointsAmount)} ${o.currency ?? o.pointProgram?.name ?? 'pts'}`
          : '—'
  },
  { header: 'Value', render: (o) => <Text fw={600}>{formatCents(o.valueCents)}</Text> },
  { header: 'Min spend', render: (o) => formatCents(o.minSpendCents) },
  { header: 'Window', render: (o) => (o.windowMonths ? `${o.windowMonths} mo` : '—') },
  { header: 'Expires', render: (o) => formatDate(o.expires) }
]

export function AvailableOffers(): React.ReactElement {
  const utils = trpc.useUtils()
  const offers = trpc.offers.list.useQuery()
  const products = trpc.products.listForSelect.useQuery()
  const programs = trpc.points.listForSelect.useQuery()

  const invalidate = (): void => {
    void utils.offers.list.invalidate()
    void utils.products.listForSelect.invalidate()
  }

  const create = trpc.offers.create.useMutation({ onSuccess: invalidate })
  const update = trpc.offers.update.useMutation({ onSuccess: invalidate })
  const remove = trpc.offers.delete.useMutation({ onSuccess: invalidate })
  const importCsv = trpc.offers.importCsv.useMutation({
    onSuccess: (res) => {
      invalidate()
      showSuccess(`Imported ${res.total} offers (${res.created} new, ${res.updated} updated)`)
    }
  })
  const onPickFile = async (file: File | null): Promise<void> => {
    if (!file) return
    importCsv.mutate({ text: await readTextFile(file) })
  }

  const productOptions = (products.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))

  const editor = useEntityEditor<OfferRow, OfferFormValue>({
    entityLabel: 'offer',
    size: 'lg',
    create,
    update,
    form: (props) => (
      <OfferForm productOptions={productOptions} programs={programs.data ?? []} {...props} />
    )
  })

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text c="dimmed" size="sm">
          Track signup-bonus offers available on card types — what you could go get.
        </Text>
        <Group gap="xs">
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
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={editor.openCreate}
            disabled={(products.data ?? []).length === 0}
          >
            Add offer
          </Button>
        </Group>
      </Group>

      <QueryGate queries={[offers]}>
        <DataTable
          columns={COLUMNS}
          rows={offers.data}
          verticalSpacing="sm"
          empty={{
            title: 'No offers tracked',
            description: "Add the current signup-bonus offers for cards you're considering."
          }}
          rowActions={(o) => (
            <RowActionsMenu
              onEdit={() => editor.openEdit(o)}
              onDelete={() => remove.mutate({ id: o.id })}
              deleteLabel="Delete this offer?"
            />
          )}
        />
      </QueryGate>

      {editor.element}
    </>
  )
}
