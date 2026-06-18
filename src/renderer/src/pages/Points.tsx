import React, { useState } from 'react'
import {
  Table,
  Button,
  Modal,
  TextInput,
  NumberInput,
  Select,
  Textarea,
  Group,
  ActionIcon,
  Menu,
  Text
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconDots, IconEdit, IconTrash } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { POINT_PROGRAM_KINDS } from '@shared/constants'
import { formatCents, formatPoints, pointsValueCents } from '@shared/format'
import type { PointProgramRow } from '../lib/types'

export function Points(): React.ReactElement {
  const utils = trpc.useUtils()
  const programs = trpc.points.list.useQuery()
  const people = trpc.people.list.useQuery()
  const [editing, setEditing] = useState<PointProgramRow | null>(null)
  const [opened, setOpened] = useState(false)

  const form = useForm({
    initialValues: {
      name: '',
      ownerPersonId: '',
      kind: '',
      valuationCpp: '' as number | '',
      balance: '' as number | '',
      notes: ''
    },
    validate: { name: (v) => (v.trim() ? null : 'Name is required') }
  })

  const invalidate = (): void => {
    void utils.points.list.invalidate()
    void utils.points.listForSelect.invalidate()
    void utils.bonuses.list.invalidate()
  }
  const onError = (e: { message: string }): void => {
    notifications.show({ color: 'red', message: e.message })
  }

  const create = trpc.points.create.useMutation({ onSuccess: invalidate, onError })
  const update = trpc.points.update.useMutation({ onSuccess: invalidate, onError })
  const remove = trpc.points.delete.useMutation({ onSuccess: invalidate, onError })

  const openCreate = (): void => {
    setEditing(null)
    form.setValues({ name: '', ownerPersonId: '', kind: '', valuationCpp: '', balance: '', notes: '' })
    setOpened(true)
  }
  const openEdit = (p: PointProgramRow): void => {
    setEditing(p)
    form.setValues({
      name: p.name,
      ownerPersonId: p.ownerPersonId ? String(p.ownerPersonId) : '',
      kind: p.kind ?? '',
      valuationCpp: p.valuationCpp ?? '',
      balance: p.balance ?? '',
      notes: p.notes ?? ''
    })
    setOpened(true)
  }

  const submit = form.onSubmit((v) => {
    const payload = {
      name: v.name.trim(),
      ownerPersonId: v.ownerPersonId ? Number(v.ownerPersonId) : null,
      kind: (v.kind || null) as (typeof POINT_PROGRAM_KINDS)[number] | null,
      valuationCpp: v.valuationCpp === '' ? null : Number(v.valuationCpp),
      balance: v.balance === '' ? null : Number(v.balance),
      notes: v.notes || null
    }
    const opts = {
      onSuccess: () => {
        setOpened(false)
        notifications.show({ message: editing ? 'Program updated' : 'Program added' })
      }
    }
    if (editing) update.mutate({ id: editing.id, ...payload }, opts)
    else create.mutate(payload, opts)
  })

  const peopleOptions = (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))

  return (
    <>
      <PageHeader title="Points">
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Add program
        </Button>
      </PageHeader>
      <Text c="dimmed" mb="md">
        Each program&apos;s valuation (cents per point) is what makes signup bonuses worth a real
        dollar figure.
      </Text>

      {programs.data && programs.data.length === 0 ? (
        <EmptyState
          title="No point programs yet"
          description="Add Amex MR, Chase UR, airline miles, etc., with a cents-per-point valuation."
        />
      ) : (
        <Table highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Program</Table.Th>
              <Table.Th>Owner</Table.Th>
              <Table.Th>Kind</Table.Th>
              <Table.Th>Valuation</Table.Th>
              <Table.Th>Balance</Table.Th>
              <Table.Th>Balance value</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {programs.data?.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td fw={500}>{p.name}</Table.Td>
                <Table.Td>{p.owner?.name ?? <Text c="dimmed">—</Text>}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {p.kind}
                  </Text>
                </Table.Td>
                <Table.Td>{p.valuationCpp != null ? `${p.valuationCpp}¢` : '—'}</Table.Td>
                <Table.Td>{formatPoints(p.balance)}</Table.Td>
                <Table.Td>{formatCents(pointsValueCents(p.balance, p.valuationCpp))}</Table.Td>
                <Table.Td>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray">
                        <IconDots size={18} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => openEdit(p)}>
                        Edit
                      </Menu.Item>
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={16} />}
                        onClick={() => {
                          if (window.confirm(`Delete ${p.name}?`)) remove.mutate({ id: p.id })
                        }}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={editing ? 'Edit program' : 'Add program'}
      >
        <form onSubmit={submit}>
          <TextInput label="Name" withAsterisk {...form.getInputProps('name')} mb="sm" />
          <Select
            label="Owner"
            data={peopleOptions}
            searchable
            clearable
            {...form.getInputProps('ownerPersonId')}
            mb="sm"
          />
          <Select
            label="Kind"
            data={POINT_PROGRAM_KINDS as unknown as string[]}
            clearable
            {...form.getInputProps('kind')}
            mb="sm"
          />
          <NumberInput
            label="Valuation (¢ per point)"
            description="e.g. 1.5 for typical transferable points"
            min={0}
            step={0.1}
            decimalScale={3}
            {...form.getInputProps('valuationCpp')}
            mb="sm"
          />
          <NumberInput
            label="Current balance (points)"
            min={0}
            thousandSeparator=","
            {...form.getInputProps('balance')}
            mb="sm"
          />
          <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} mb="md" />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {editing ? 'Save' : 'Add'}
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  )
}
