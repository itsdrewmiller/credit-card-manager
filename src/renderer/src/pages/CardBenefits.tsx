import React, { useState } from 'react'
import {
  Table,
  Button,
  Modal,
  Select,
  TextInput,
  NumberInput,
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
import { EmptyState } from '../components/EmptyState'
import { BENEFIT_PERIODS, type BenefitPeriod } from '@shared/constants'
import { centsToDollars, parseCents, formatCents } from '@shared/format'
import type { ProductBenefitRow } from '../lib/types'

export function CardBenefits(): React.ReactElement {
  const utils = trpc.useUtils()
  const templates = trpc.productBenefits.list.useQuery()
  const products = trpc.products.listForSelect.useQuery()
  const [opened, setOpened] = useState(false)
  const [editing, setEditing] = useState<ProductBenefitRow | null>(null)

  const form = useForm({
    initialValues: {
      cardProductId: '',
      name: '',
      category: '',
      amountDollars: '' as number | '',
      period: '',
      notes: ''
    },
    validate: {
      cardProductId: (v) => (v ? null : 'Pick a card'),
      name: (v) => (v.trim() ? null : 'Name is required')
    }
  })

  const invalidate = (): void => void utils.productBenefits.list.invalidate()
  const onError = (e: { message: string }): void => {
    notifications.show({ color: 'red', message: e.message })
  }
  const create = trpc.productBenefits.create.useMutation({ onSuccess: invalidate, onError })
  const update = trpc.productBenefits.update.useMutation({ onSuccess: invalidate, onError })
  const remove = trpc.productBenefits.delete.useMutation({ onSuccess: invalidate, onError })

  const productOptions = (products.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))

  const openCreate = (): void => {
    setEditing(null)
    form.reset()
    setOpened(true)
  }
  const openEdit = (t: ProductBenefitRow): void => {
    setEditing(t)
    form.setValues({
      cardProductId: String(t.cardProductId),
      name: t.name,
      category: t.category ?? '',
      amountDollars: centsToDollars(t.amountCents),
      period: t.period ?? '',
      notes: t.notes ?? ''
    })
    setOpened(true)
  }

  const submit = form.onSubmit((v) => {
    const payload = {
      cardProductId: Number(v.cardProductId),
      name: v.name.trim(),
      category: v.category || null,
      amountCents: parseCents(v.amountDollars),
      period: (v.period || null) as BenefitPeriod | null,
      notes: v.notes || null
    }
    const opts = {
      onSuccess: () => {
        setOpened(false)
        notifications.show({ message: editing ? 'Template updated' : 'Template added' })
      }
    }
    if (editing) update.mutate({ id: editing.id, ...payload }, opts)
    else create.mutate(payload, opts)
  })

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text c="dimmed" size="sm">
          Benefits that belong to a card type. When you add a card of that type, these are copied into
          your benefits automatically.
        </Text>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={openCreate}
          disabled={(products.data ?? []).length === 0}
        >
          Add card benefit
        </Button>
      </Group>

      {templates.data && templates.data.length === 0 ? (
        <EmptyState
          title="No card benefits yet"
          description="Add the recurring credits a card type comes with (e.g. a $200 travel credit)."
        />
      ) : (
        <Table highlightOnHover withTableBorder verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Card</Table.Th>
              <Table.Th>Benefit</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Value</Table.Th>
              <Table.Th>Period</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {templates.data?.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>
                  {t.product ? `${t.product.issuer?.name ?? ''} ${t.product.name}`.trim() : '—'}
                </Table.Td>
                <Table.Td fw={500}>{t.name}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {t.category}
                  </Text>
                </Table.Td>
                <Table.Td>{formatCents(t.amountCents)}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {t.period}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray">
                        <IconDots size={18} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => openEdit(t)}>
                        Edit
                      </Menu.Item>
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={16} />}
                        onClick={() => {
                          if (window.confirm(`Delete ${t.name}?`)) remove.mutate({ id: t.id })
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
        title={editing ? 'Edit card benefit' : 'Add card benefit'}
      >
        <form onSubmit={submit}>
          <Select
            label="Card"
            withAsterisk
            data={productOptions}
            searchable
            {...form.getInputProps('cardProductId')}
            mb="sm"
          />
          <TextInput label="Benefit name" withAsterisk {...form.getInputProps('name')} mb="sm" />
          <Group grow mb="sm">
            <TextInput
              label="Category"
              placeholder="Travel, Dining, …"
              {...form.getInputProps('category')}
            />
            <Select
              label="Period"
              data={BENEFIT_PERIODS as unknown as string[]}
              clearable
              {...form.getInputProps('period')}
            />
          </Group>
          <NumberInput
            label="Value ($)"
            min={0}
            decimalScale={2}
            {...form.getInputProps('amountDollars')}
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
