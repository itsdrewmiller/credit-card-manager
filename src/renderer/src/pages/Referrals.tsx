import React, { useState } from 'react'
import {
  Table,
  Button,
  Modal,
  TextInput,
  Select,
  Textarea,
  Group,
  ActionIcon,
  Menu,
  Badge,
  Anchor,
  Text,
  SimpleGrid
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconDots, IconEdit, IconTrash } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { REFERRAL_STATUSES, type ReferralStatus } from '@shared/constants'
import { formatDate } from '@shared/format'
import { isoToDate, dateToIso } from '../lib/dates'
import type { ReferralRow } from '../lib/types'

const STATUS_COLOR: Record<string, string> = {
  pending: 'gray',
  clicked: 'blue',
  approved: 'teal',
  paid: 'green'
}

export function Referrals(): React.ReactElement {
  const utils = trpc.useUtils()
  const referrals = trpc.referrals.list.useQuery()
  const people = trpc.people.list.useQuery()
  const products = trpc.products.listForSelect.useQuery()
  const [editing, setEditing] = useState<ReferralRow | null>(null)
  const [opened, setOpened] = useState(false)

  const form = useForm({
    initialValues: {
      fromPersonId: '',
      toPersonId: '',
      cardProductId: '',
      link: '',
      rewardAmount: '',
      date: null as Date | null,
      status: '',
      notes: ''
    },
    validate: { fromPersonId: (v) => (v ? null : 'Referrer is required') }
  })

  const invalidate = (): void => void utils.referrals.list.invalidate()
  const onError = (e: { message: string }): void => {
    notifications.show({ color: 'red', message: e.message })
  }

  const create = trpc.referrals.create.useMutation({ onSuccess: invalidate, onError })
  const update = trpc.referrals.update.useMutation({ onSuccess: invalidate, onError })
  const remove = trpc.referrals.delete.useMutation({ onSuccess: invalidate, onError })

  const openCreate = (): void => {
    setEditing(null)
    form.setValues({
      fromPersonId: '',
      toPersonId: '',
      cardProductId: '',
      link: '',
      rewardAmount: '',
      date: null,
      status: '',
      notes: ''
    })
    setOpened(true)
  }
  const openEdit = (r: ReferralRow): void => {
    setEditing(r)
    form.setValues({
      fromPersonId: String(r.fromPersonId),
      toPersonId: r.toPersonId ? String(r.toPersonId) : '',
      cardProductId: r.cardProductId ? String(r.cardProductId) : '',
      link: r.link ?? '',
      rewardAmount: r.rewardAmount ?? '',
      date: isoToDate(r.date),
      status: r.status ?? '',
      notes: r.notes ?? ''
    })
    setOpened(true)
  }

  const submit = form.onSubmit((v) => {
    const payload = {
      fromPersonId: Number(v.fromPersonId),
      toPersonId: v.toPersonId ? Number(v.toPersonId) : null,
      cardProductId: v.cardProductId ? Number(v.cardProductId) : null,
      link: v.link || null,
      rewardAmount: v.rewardAmount || null,
      date: dateToIso(v.date),
      status: (v.status || null) as ReferralStatus | null,
      notes: v.notes || null
    }
    const opts = {
      onSuccess: () => {
        setOpened(false)
        notifications.show({ message: editing ? 'Referral updated' : 'Referral added' })
      }
    }
    if (editing) update.mutate({ id: editing.id, ...payload }, opts)
    else create.mutate(payload, opts)
  })

  const peopleOptions = (people.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))
  const productOptions = (products.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))

  return (
    <>
      <PageHeader title="Referrals">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={openCreate}
          disabled={(people.data ?? []).length === 0}
        >
          Add referral
        </Button>
      </PageHeader>
      <Text c="dimmed" mb="md">
        Track referrals between the people you manage — who referred whom, for which card, and
        whether the bonus has paid.
      </Text>

      {(people.data ?? []).length === 0 ? (
        <EmptyState title="Add people first" description="Referrals are between people." />
      ) : referrals.data && referrals.data.length === 0 ? (
        <EmptyState title="No referrals yet" description="Record a referral link or a sent referral." />
      ) : (
        <Table highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>From</Table.Th>
              <Table.Th>To</Table.Th>
              <Table.Th>Product</Table.Th>
              <Table.Th>Reward</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Link</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {referrals.data?.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td fw={500}>{r.from?.name}</Table.Td>
                <Table.Td>{r.to?.name ?? <Text c="dimmed">—</Text>}</Table.Td>
                <Table.Td>
                  {r.product ? `${r.product.issuer?.name ?? ''} ${r.product.name}`.trim() : '—'}
                </Table.Td>
                <Table.Td>{r.rewardAmount ?? '—'}</Table.Td>
                <Table.Td>{formatDate(r.date)}</Table.Td>
                <Table.Td>
                  {r.status ? (
                    <Badge color={STATUS_COLOR[r.status] ?? 'gray'} variant="light">
                      {r.status}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </Table.Td>
                <Table.Td>
                  {r.link ? (
                    <Anchor href={r.link} target="_blank" size="sm">
                      open
                    </Anchor>
                  ) : (
                    '—'
                  )}
                </Table.Td>
                <Table.Td>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray">
                        <IconDots size={18} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => openEdit(r)}>
                        Edit
                      </Menu.Item>
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={16} />}
                        onClick={() => {
                          if (window.confirm('Delete this referral?')) remove.mutate({ id: r.id })
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
        title={editing ? 'Edit referral' : 'Add referral'}
      >
        <form onSubmit={submit}>
          <SimpleGrid cols={2} mb="sm">
            <Select
              label="From (referrer)"
              withAsterisk
              data={peopleOptions}
              searchable
              {...form.getInputProps('fromPersonId')}
            />
            <Select
              label="To (referred)"
              data={peopleOptions}
              searchable
              clearable
              {...form.getInputProps('toPersonId')}
            />
          </SimpleGrid>
          <Select
            label="Product"
            data={productOptions}
            searchable
            clearable
            {...form.getInputProps('cardProductId')}
            mb="sm"
          />
          <TextInput
            label="Link"
            placeholder="https://…"
            {...form.getInputProps('link')}
            mb="sm"
          />
          <SimpleGrid cols={2} mb="sm">
            <TextInput
              label="Reward"
              placeholder="e.g. 20,000 pts"
              {...form.getInputProps('rewardAmount')}
            />
            <Select
              label="Status"
              data={REFERRAL_STATUSES as unknown as string[]}
              clearable
              {...form.getInputProps('status')}
            />
          </SimpleGrid>
          <DateInput
            label="Date"
            valueFormat="YYYY-MM-DD"
            clearable
            {...form.getInputProps('date')}
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
