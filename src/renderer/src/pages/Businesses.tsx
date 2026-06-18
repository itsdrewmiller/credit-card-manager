import React, { useState } from 'react'
import {
  Table,
  Button,
  Modal,
  TextInput,
  Textarea,
  Select,
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
import { BUSINESS_TYPES } from '@shared/constants'

interface BizRow {
  id: number
  name: string
  ownerPersonId: number
  type: string | null
  notes: string | null
  owner?: { name: string } | null
}

export function Businesses(): React.ReactElement {
  const utils = trpc.useUtils()
  const businesses = trpc.businesses.list.useQuery()
  const people = trpc.people.list.useQuery()
  const [editing, setEditing] = useState<BizRow | null>(null)
  const [opened, setOpened] = useState(false)

  const form = useForm({
    initialValues: { name: '', ownerPersonId: '', type: '', notes: '' },
    validate: {
      name: (v) => (v.trim() ? null : 'Name is required'),
      ownerPersonId: (v) => (v ? null : 'Owner is required')
    }
  })

  const invalidate = (): void => void utils.businesses.list.invalidate()
  const onError = (e: { message: string }): void => {
    notifications.show({ color: 'red', message: e.message })
  }

  const create = trpc.businesses.create.useMutation({ onSuccess: invalidate, onError })
  const update = trpc.businesses.update.useMutation({ onSuccess: invalidate, onError })
  const remove = trpc.businesses.delete.useMutation({ onSuccess: invalidate, onError })

  const openCreate = (): void => {
    setEditing(null)
    form.setValues({ name: '', ownerPersonId: '', type: '', notes: '' })
    setOpened(true)
  }
  const openEdit = (b: BizRow): void => {
    setEditing(b)
    form.setValues({
      name: b.name,
      ownerPersonId: String(b.ownerPersonId),
      type: b.type ?? '',
      notes: b.notes ?? ''
    })
    setOpened(true)
  }

  const submit = form.onSubmit((values) => {
    const payload = {
      name: values.name.trim(),
      ownerPersonId: Number(values.ownerPersonId),
      type: values.type || null,
      notes: values.notes || null
    }
    const opts = {
      onSuccess: () => {
        setOpened(false)
        notifications.show({ message: editing ? 'Business updated' : 'Business added' })
      }
    }
    if (editing) update.mutate({ id: editing.id, ...payload }, opts)
    else create.mutate(payload, opts)
  })

  const peopleOptions = (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))

  return (
    <>
      <PageHeader title="Businesses">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={openCreate}
          disabled={(people.data ?? []).length === 0}
        >
          Add business
        </Button>
      </PageHeader>

      {(people.data ?? []).length === 0 ? (
        <EmptyState title="Add a person first" description="Businesses must be owned by a person." />
      ) : businesses.data && businesses.data.length === 0 ? (
        <EmptyState
          title="No businesses yet"
          description="Add the businesses you open cards under (LLC, sole proprietor, etc.)."
        />
      ) : (
        <Table highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Owner</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {businesses.data?.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td fw={500}>{b.name}</Table.Td>
                <Table.Td>{b.owner?.name}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {b.type}
                  </Text>
                </Table.Td>
                <Table.Td c="dimmed">{b.notes}</Table.Td>
                <Table.Td>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray">
                        <IconDots size={18} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => openEdit(b)}>
                        Edit
                      </Menu.Item>
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={16} />}
                        onClick={() => {
                          if (window.confirm(`Delete ${b.name}?`)) remove.mutate({ id: b.id })
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
        title={editing ? 'Edit business' : 'Add business'}
      >
        <form onSubmit={submit}>
          <TextInput label="Name" withAsterisk {...form.getInputProps('name')} mb="sm" />
          <Select
            label="Owner"
            withAsterisk
            data={peopleOptions}
            searchable
            {...form.getInputProps('ownerPersonId')}
            mb="sm"
          />
          <Select
            label="Type"
            data={BUSINESS_TYPES as unknown as string[]}
            clearable
            {...form.getInputProps('type')}
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
