import React from 'react'
import { Button, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { QueryGate } from '../components/QueryGate'
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { BusinessForm, type BusinessFormValue } from '../components/BusinessForm'
import type { BusinessRow } from '../lib/types'

const COLUMNS: Column<BusinessRow>[] = [
  { header: 'Name', render: (b) => <Text fw={500}>{b.name}</Text> },
  { header: 'Owner', render: (b) => b.owner?.name },
  {
    header: 'Type',
    render: (b) => (
      <Text size="sm" c="dimmed">
        {b.type}
      </Text>
    )
  },
  { header: 'Notes', render: (b) => <Text c="dimmed">{b.notes}</Text> }
]

export function Businesses(): React.ReactElement {
  const utils = trpc.useUtils()
  const businesses = trpc.businesses.list.useQuery()
  const people = trpc.people.list.useQuery()

  const invalidate = (): void => void utils.businesses.list.invalidate()

  const create = trpc.businesses.create.useMutation({ onSuccess: invalidate })
  const update = trpc.businesses.update.useMutation({ onSuccess: invalidate })
  const remove = trpc.businesses.delete.useMutation({ onSuccess: invalidate })

  const peopleOptions = (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))

  const editor = useEntityEditor<BusinessRow, BusinessFormValue>({
    entityLabel: 'business',
    create,
    update,
    form: (props) => <BusinessForm peopleOptions={peopleOptions} {...props} />
  })

  return (
    <>
      <PageHeader title="Businesses">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={editor.openCreate}
          disabled={(people.data ?? []).length === 0}
        >
          Add business
        </Button>
      </PageHeader>

      <QueryGate queries={[businesses, people]}>
        {(people.data ?? []).length === 0 ? (
          <EmptyState title="Add a person first" description="Businesses must be owned by a person." />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={businesses.data}
            empty={{
              title: 'No businesses yet',
              description: 'Add the businesses you open cards under (LLC, sole proprietor, etc.).'
            }}
            rowActions={(b) => (
              <RowActionsMenu
                onEdit={() => editor.openEdit(b)}
                onDelete={() => remove.mutate({ id: b.id })}
                deleteLabel={`Delete ${b.name}?`}
              />
            )}
          />
        )}
      </QueryGate>

      {editor.element}
    </>
  )
}
