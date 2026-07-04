import React from 'react'
import { Table } from '@mantine/core'
import { EmptyState } from './EmptyState'

export interface Column<Row> {
  header: React.ReactNode
  render: (row: Row) => React.ReactNode
  w?: number | string
  miw?: number | string
}

/**
 * Deliberately dumb list table: columns + rows + empty state + an optional
 * trailing actions cell. No sorting/filtering/pagination — pages that need
 * those (Cards) use <Table> directly.
 */
export function DataTable<Row extends { id: number }>({
  columns,
  rows,
  empty,
  rowActions,
  verticalSpacing
}: {
  columns: Column<Row>[]
  rows: Row[] | undefined
  empty: { title: string; description?: string }
  /** Rendered in a trailing w=48 cell, typically <RowActionsMenu>. */
  rowActions?: (row: Row) => React.ReactNode
  verticalSpacing?: string
}): React.ReactElement {
  const list = rows ?? []
  if (list.length === 0) return <EmptyState title={empty.title} description={empty.description} />
  return (
    <Table highlightOnHover withTableBorder verticalSpacing={verticalSpacing}>
      <Table.Thead>
        <Table.Tr>
          {columns.map((c, i) => (
            <Table.Th key={i} w={c.w} miw={c.miw}>
              {c.header}
            </Table.Th>
          ))}
          {rowActions && <Table.Th w={48} />}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {list.map((row) => (
          <Table.Tr key={row.id}>
            {columns.map((c, i) => (
              <Table.Td key={i}>{c.render(row)}</Table.Td>
            ))}
            {rowActions && <Table.Td>{rowActions(row)}</Table.Td>}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
