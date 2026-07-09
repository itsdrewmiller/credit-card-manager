import React from 'react'
import { Box, Card, Group, Stack, Table, Text } from '@mantine/core'
import { EmptyState } from './EmptyState'

export interface Column<Row> {
  header: React.ReactNode
  render: (row: Row) => React.ReactNode
  w?: number | string
  miw?: number | string
}

/**
 * Stacked-card rendering of rows for phone widths: the first column is the
 * card title, the rest are header-labeled lines. Hidden from the sm
 * breakpoint up. Used by DataTable, and directly by pages that manage their
 * own <Table> (Cards) so they too avoid horizontal scrolling on phones.
 */
export function RowCardList<Row extends { id: number | string }>({
  columns,
  rows,
  rowActions
}: {
  columns: Column<Row>[]
  rows: Row[]
  rowActions?: (row: Row) => React.ReactNode
}): React.ReactElement {
  const [title, ...rest] = columns
  return (
    <Stack hiddenFrom="sm" gap="sm">
      {rows.map((row) => (
        <Card key={row.id} withBorder radius="md" padding="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap" mb={rest.length ? 'xs' : 0}>
            <Box style={{ minWidth: 0, flex: 1 }}>{title.render(row)}</Box>
            {rowActions && <Box>{rowActions(row)}</Box>}
          </Group>
          <Stack gap={6}>
            {rest.map((c, i) => (
              <Group key={i} justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  {c.header}
                </Text>
                <Box style={{ textAlign: 'right', minWidth: 0 }}>{c.render(row)}</Box>
              </Group>
            ))}
          </Stack>
        </Card>
      ))}
    </Stack>
  )
}

/**
 * Deliberately dumb list table: columns + rows + empty state + an optional
 * trailing actions cell. No sorting/filtering/pagination — pages that need
 * those (Cards) use <Table> directly.
 *
 * Below the sm breakpoint each row renders as a stacked card instead (via
 * RowCardList), so every DataTable page works at phone width without
 * horizontal scrolling.
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
    <>
      <Box visibleFrom="sm">
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
      </Box>
      <RowCardList columns={columns} rows={list} rowActions={rowActions} />
    </>
  )
}
