import React, { useState } from 'react'
import { Table, Button, Modal, TextInput, Textarea, Group, ActionIcon, Menu } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconDots, IconEdit, IconTrash } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'

interface PersonRow {
  id: number
  name: string
  notes: string | null
}

export function People(): React.ReactElement {
  const utils = trpc.useUtils()
  const people = trpc.people.list.useQuery()
  const [editing, setEditing] = useState<PersonRow | null>(null)
  const [opened, setOpened] = useState(false)

  const form = useForm({
    initialValues: { name: '', notes: '' },
    validate: { name: (v) => (v.trim() ? null : 'Name is required') }
  })

  const invalidate = (): void => {
    void utils.people.list.invalidate()
    void utils.system.health.invalidate()
  }
  const onError = (e: { message: string }): void => {
    notifications.show({ color: 'red', message: e.message })
  }

  const create = trpc.people.create.useMutation({ onSuccess: invalidate, onError })
  const update = trpc.people.update.useMutation({ onSuccess: invalidate, onError })
  const remove = trpc.people.delete.useMutation({ onSuccess: invalidate, onError })

  const openCreate = (): void => {
    setEditing(null)
    form.setValues({ name: '', notes: '' })
    setOpened(true)
  }
  const openEdit = (p: PersonRow): void => {
    setEditing(p)
    form.setValues({ name: p.name, notes: p.notes ?? '' })
    setOpened(true)
  }

  const submit = form.onSubmit((values) => {
    const payload = { name: values.name.trim(), notes: values.notes || null }
    const opts = {
      onSuccess: () => {
        setOpened(false)
        notifications.show({ message: editing ? 'Person updated' : 'Person added' })
      }
    }
    if (editing) update.mutate({ id: editing.id, ...payload }, opts)
    else create.mutate(payload, opts)
  })

  return (
    <>
      <PageHeader title="People">
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Add person
        </Button>
      </PageHeader>

      {people.data && people.data.length === 0 ? (
        <EmptyState
          title="No people yet"
          description="Add yourself first, then anyone else whose cards you track (spouse, family)."
        />
      ) : (
        <Table highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {people.data?.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td fw={500}>{p.name}</Table.Td>
                <Table.Td c="dimmed">{p.notes}</Table.Td>
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
                          if (window.confirm(`Delete ${p.name}? Their cards will be unlinked.`))
                            remove.mutate({ id: p.id })
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
        title={editing ? 'Edit person' : 'Add person'}
      >
        <form onSubmit={submit}>
          <TextInput label="Name" withAsterisk {...form.getInputProps('name')} mb="sm" />
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
