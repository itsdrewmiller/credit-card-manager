import React from 'react'
import { Button, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { QueryGate } from '../components/QueryGate'
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { PersonForm, type PersonFormValue } from '../components/PersonForm'
import type { PersonRow } from '../lib/types'

const COLUMNS: Column<PersonRow>[] = [
  { header: 'Name', render: (p) => <Text fw={500}>{p.name}</Text> },
  { header: 'Notes', render: (p) => <Text c="dimmed">{p.notes}</Text> }
]

export function People(): React.ReactElement {
  const utils = trpc.useUtils()
  const people = trpc.people.list.useQuery()

  const invalidate = (): void => {
    void utils.people.list.invalidate()
    void utils.system.health.invalidate()
  }

  const create = trpc.people.create.useMutation({ onSuccess: invalidate })
  const update = trpc.people.update.useMutation({ onSuccess: invalidate })
  const remove = trpc.people.delete.useMutation({ onSuccess: invalidate })

  const editor = useEntityEditor<PersonRow, PersonFormValue>({
    entityLabel: 'person',
    create,
    update,
    form: (props) => <PersonForm {...props} />
  })

  return (
    <>
      <PageHeader title="People">
        <Button leftSection={<IconPlus size={16} />} onClick={editor.openCreate}>
          Add person
        </Button>
      </PageHeader>

      <QueryGate queries={[people]}>
        <DataTable
          columns={COLUMNS}
          rows={people.data}
          empty={{
            title: 'No people yet',
            description:
              'Add yourself first, then anyone else whose cards you track (spouse, family).'
          }}
          rowActions={(p) => (
            <RowActionsMenu
              onEdit={() => editor.openEdit(p)}
              onDelete={() => remove.mutate({ id: p.id })}
              deleteLabel={`Delete ${p.name}? Their cards will be unlinked.`}
            />
          )}
        />
      </QueryGate>

      {editor.element}
    </>
  )
}
