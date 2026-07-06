import React from 'react'
import { Button, Group, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { QueryGate } from '../components/QueryGate'
import { DataTable, type Column } from '../components/DataTable'
import { RowActionsMenu } from '../components/RowActionsMenu'
import { useEntityEditor } from '../components/useEntityEditor'
import { PointProgramForm, type PointProgramFormValue } from '../components/PointProgramForm'
import { formatCents, formatPoints, pointsValueCents } from '@shared/format'
import { usePeopleOptions } from '../lib/options'
import type { PointProgramRow } from '../lib/types'

const COLUMNS: Column<PointProgramRow>[] = [
  { header: 'Program', render: (p) => <Text fw={500}>{p.name}</Text> },
  { header: 'Owner', render: (p) => p.owner?.name ?? <Text c="dimmed">—</Text> },
  {
    header: 'Kind',
    render: (p) => (
      <Text size="sm" c="dimmed">
        {p.kind}
      </Text>
    )
  },
  { header: 'Valuation', render: (p) => (p.valuationCpp != null ? `${p.valuationCpp}¢` : '—') },
  { header: 'Balance', render: (p) => formatPoints(p.balance) },
  { header: 'Balance value', render: (p) => formatCents(pointsValueCents(p.balance, p.valuationCpp)) }
]

export function Points(): React.ReactElement {
  const utils = trpc.useUtils()
  const programs = trpc.points.list.useQuery()

  // Valuations feed bonus values, so refresh those too.
  const invalidate = (): void => {
    void utils.points.list.invalidate()
    void utils.points.listForSelect.invalidate()
    void utils.bonuses.list.invalidate()
  }

  const create = trpc.points.create.useMutation({ onSuccess: invalidate })
  const update = trpc.points.update.useMutation({ onSuccess: invalidate })
  const remove = trpc.points.delete.useMutation({ onSuccess: invalidate })

  const peopleOptions = usePeopleOptions()
  const editor = useEntityEditor<PointProgramRow, PointProgramFormValue>({
    entityLabel: 'program',
    create,
    update,
    form: (props) => <PointProgramForm peopleOptions={peopleOptions} {...props} />
  })

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text c="dimmed" size="sm">
          Each program&apos;s valuation (cents per point) is what makes signup bonuses worth a real
          dollar figure.
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={editor.openCreate}>
          Add program
        </Button>
      </Group>

      <QueryGate queries={[programs]}>
        <DataTable
          columns={COLUMNS}
          rows={programs.data}
          empty={{
            title: 'No point programs yet',
            description: 'Add Amex MR, Chase UR, airline miles, etc., with a cents-per-point valuation.'
          }}
          rowActions={(p) => (
            <RowActionsMenu
              onEdit={() => editor.openEdit(p)}
              onDelete={() => remove.mutate({ id: p.id })}
              deleteLabel={`Delete ${p.name}?`}
            />
          )}
        />
      </QueryGate>

      {editor.element}
    </>
  )
}
