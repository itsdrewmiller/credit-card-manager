import React from 'react'
import { Button, Group, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { QueryGate } from '../components/QueryGate'
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { ProductBenefitForm, type ProductBenefitFormValue } from '../components/ProductBenefitForm'
import { formatCents } from '@shared/format'
import type { ProductBenefitRow } from '../lib/types'

const COLUMNS: Column<ProductBenefitRow>[] = [
  {
    header: 'Card',
    render: (t) => (t.product ? `${t.product.issuer?.name ?? ''} ${t.product.name}`.trim() : '—')
  },
  { header: 'Benefit', render: (t) => <Text fw={500}>{t.name}</Text> },
  {
    header: 'Category',
    render: (t) => (
      <Text size="sm" c="dimmed">
        {t.category}
      </Text>
    )
  },
  { header: 'Value', render: (t) => formatCents(t.amountCents) },
  {
    header: 'Period',
    render: (t) => (
      <Text size="sm" c="dimmed">
        {t.period}
      </Text>
    )
  }
]

export function CardBenefits(): React.ReactElement {
  const utils = trpc.useUtils()
  const templates = trpc.productBenefits.list.useQuery()
  const products = trpc.products.listForSelect.useQuery()

  const invalidate = (): void => void utils.productBenefits.list.invalidate()

  const create = trpc.productBenefits.create.useMutation({ onSuccess: invalidate })
  const update = trpc.productBenefits.update.useMutation({ onSuccess: invalidate })
  const remove = trpc.productBenefits.delete.useMutation({ onSuccess: invalidate })

  const productOptions = (products.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))

  const editor = useEntityEditor<ProductBenefitRow, ProductBenefitFormValue>({
    entityLabel: 'card benefit',
    titles: { create: 'Add card benefit', edit: 'Edit card benefit' },
    create,
    update,
    form: (props) => <ProductBenefitForm productOptions={productOptions} {...props} />
  })

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text c="dimmed" size="sm">
          Benefits that belong to a card type. When you add a card of that type, these are copied into
          your benefits automatically.
        </Text>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={editor.openCreate}
          disabled={(products.data ?? []).length === 0}
        >
          Add card benefit
        </Button>
      </Group>

      <QueryGate queries={[templates]}>
        <DataTable
          columns={COLUMNS}
          rows={templates.data}
          verticalSpacing="sm"
          empty={{
            title: 'No card benefits yet',
            description: 'Add the recurring credits a card type comes with (e.g. a $200 travel credit).'
          }}
          rowActions={(t) => (
            <RowActionsMenu
              onEdit={() => editor.openEdit(t)}
              onDelete={() => remove.mutate({ id: t.id })}
              deleteLabel={`Delete ${t.name}?`}
            />
          )}
        />
      </QueryGate>

      {editor.element}
    </>
  )
}
