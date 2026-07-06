import React from 'react'
import { Button, Badge, Anchor, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { ReferralForm, type ReferralFormValue } from '../components/ReferralForm'
import { formatDate } from '@shared/dates'
import type { ReferralRow } from '../lib/types'

const STATUS_COLOR: Record<string, string> = {
  pending: 'gray',
  clicked: 'blue',
  approved: 'teal',
  paid: 'green'
}

const COLUMNS: Column<ReferralRow>[] = [
  { header: 'From', render: (r) => <Text fw={500}>{r.from?.name}</Text> },
  { header: 'To', render: (r) => r.to?.name ?? <Text c="dimmed">—</Text> },
  {
    header: 'Product',
    render: (r) => (r.product ? `${r.product.issuer?.name ?? ''} ${r.product.name}`.trim() : '—')
  },
  { header: 'Reward', render: (r) => r.rewardAmount ?? '—' },
  { header: 'Date', render: (r) => formatDate(r.date) },
  {
    header: 'Status',
    render: (r) =>
      r.status ? (
        <Badge color={STATUS_COLOR[r.status] ?? 'gray'} variant="light">
          {r.status}
        </Badge>
      ) : (
        '—'
      )
  },
  {
    header: 'Link',
    render: (r) =>
      r.link ? (
        <Anchor href={r.link} target="_blank" size="sm">
          open
        </Anchor>
      ) : (
        '—'
      )
  }
]

export function Referrals(): React.ReactElement {
  const utils = trpc.useUtils()
  const referrals = trpc.referrals.list.useQuery()
  const people = trpc.people.list.useQuery()
  const products = trpc.products.listForSelect.useQuery()

  const invalidate = (): void => void utils.referrals.list.invalidate()

  const create = trpc.referrals.create.useMutation({ onSuccess: invalidate })
  const update = trpc.referrals.update.useMutation({ onSuccess: invalidate })
  const remove = trpc.referrals.delete.useMutation({ onSuccess: invalidate })

  const peopleOptions = (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))
  const productOptions = (products.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))

  const editor = useEntityEditor<ReferralRow, ReferralFormValue>({
    entityLabel: 'referral',
    create,
    update,
    form: (props) => (
      <ReferralForm peopleOptions={peopleOptions} productOptions={productOptions} {...props} />
    )
  })

  return (
    <>
      <PageHeader title="Referrals">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={editor.openCreate}
          disabled={(people.data ?? []).length === 0}
        >
          Add referral
        </Button>
      </PageHeader>
      <Text c="dimmed" mb="md">
        Track referrals between the people you manage — who referred whom, for which card, and
        whether the bonus has paid.
      </Text>

      <QueryGate queries={[referrals, people]}>
        {(people.data ?? []).length === 0 ? (
          <EmptyState title="Add people first" description="Referrals are between people." />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={referrals.data}
            empty={{
              title: 'No referrals yet',
              description: 'Record a referral link or a sent referral.'
            }}
            rowActions={(r) => (
              <RowActionsMenu
                onEdit={() => editor.openEdit(r)}
                onDelete={() => remove.mutate({ id: r.id })}
                deleteLabel="Delete this referral?"
              />
            )}
          />
        )}
      </QueryGate>

      {editor.element}
    </>
  )
}
