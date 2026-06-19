import React, { useState } from 'react'
import {
  Table,
  Button,
  Modal,
  Select,
  NumberInput,
  TextInput,
  Textarea,
  Group,
  ActionIcon,
  Menu,
  Text,
  SimpleGrid,
  Alert,
  FileButton
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconDots, IconEdit, IconTrash, IconUpload } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { EmptyState } from '../components/EmptyState'
import { REWARD_KINDS, type RewardKind } from '@shared/constants'
import { centsToDollars, parseCents, formatCents, formatPoints, formatDate, pointsValueCents } from '@shared/format'
import { isoToDate, dateToIso } from '../lib/dates'
import { readTextFile } from '../lib/download'
import type { OfferRow } from '../lib/types'

export function AvailableOffers(): React.ReactElement {
  const utils = trpc.useUtils()
  const offers = trpc.offers.list.useQuery()
  const products = trpc.products.listForSelect.useQuery()
  const programs = trpc.points.listForSelect.useQuery()
  const [opened, setOpened] = useState(false)
  const [editing, setEditing] = useState<OfferRow | null>(null)

  const form = useForm({
    initialValues: {
      cardProductId: '',
      rewardKind: 'points' as RewardKind,
      currency: '',
      pointProgramId: '',
      pointsAmount: '' as number | '',
      cashDollars: '' as number | '',
      pointValueCpp: '' as number | '',
      minSpendDollars: '' as number | '',
      windowMonths: '' as number | '',
      expires: null as Date | null,
      notes: ''
    },
    validate: { cardProductId: (v) => (v ? null : 'Pick a card') }
  })

  const invalidate = (): void => {
    void utils.offers.list.invalidate()
    void utils.products.listForSelect.invalidate()
  }
  const onError = (e: { message: string }): void => {
    notifications.show({ color: 'red', message: e.message })
  }
  const create = trpc.offers.create.useMutation({ onSuccess: invalidate, onError })
  const update = trpc.offers.update.useMutation({ onSuccess: invalidate, onError })
  const remove = trpc.offers.delete.useMutation({ onSuccess: invalidate, onError })
  const importCsv = trpc.offers.importCsv.useMutation({
    onSuccess: (res) => {
      invalidate()
      notifications.show({
        color: 'green',
        message: `Imported ${res.total} offers (${res.created} new, ${res.updated} updated)`
      })
    },
    onError
  })
  const onPickFile = async (file: File | null): Promise<void> => {
    if (!file) return
    importCsv.mutate({ text: await readTextFile(file) })
  }

  const productOptions = (products.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))

  const openCreate = (): void => {
    setEditing(null)
    form.reset()
    setOpened(true)
  }
  const openEdit = (o: OfferRow): void => {
    setEditing(o)
    form.setValues({
      cardProductId: String(o.cardProductId),
      rewardKind: (o.rewardKind ?? 'points') as RewardKind,
      currency: o.currency ?? '',
      pointProgramId: o.pointProgramId ? String(o.pointProgramId) : '',
      pointsAmount: o.pointsAmount ?? '',
      cashDollars: centsToDollars(o.cashAmountCents),
      pointValueCpp: o.pointValueCpp ?? '',
      minSpendDollars: centsToDollars(o.minSpendCents),
      windowMonths: o.windowMonths ?? '',
      expires: isoToDate(o.expires),
      notes: o.notes ?? ''
    })
    setOpened(true)
  }

  const isCash = form.values.rewardKind === 'cash'
  const selectedProgram = programs.data?.find((p) => String(p.id) === form.values.pointProgramId)
  const previewCpp =
    form.values.pointValueCpp === ''
      ? (selectedProgram?.valuationCpp ?? null)
      : Number(form.values.pointValueCpp)
  const preview = isCash
    ? parseCents(form.values.cashDollars)
    : pointsValueCents(
        form.values.pointsAmount === '' ? null : Number(form.values.pointsAmount),
        previewCpp
      )

  const submit = form.onSubmit((v) => {
    const payload = {
      cardProductId: Number(v.cardProductId),
      rewardKind: v.rewardKind,
      currency: v.currency || null,
      pointProgramId: !isCash && v.pointProgramId ? Number(v.pointProgramId) : null,
      pointsAmount: !isCash && v.pointsAmount !== '' ? Number(v.pointsAmount) : null,
      cashAmountCents: isCash ? parseCents(v.cashDollars) : null,
      pointValueCpp: v.pointValueCpp === '' ? null : Number(v.pointValueCpp),
      minSpendCents: parseCents(v.minSpendDollars),
      windowMonths: v.windowMonths === '' ? null : Number(v.windowMonths),
      expires: dateToIso(v.expires),
      notes: v.notes || null
    }
    const opts = {
      onSuccess: () => {
        setOpened(false)
        notifications.show({ message: editing ? 'Offer updated' : 'Offer added' })
      }
    }
    if (editing) update.mutate({ id: editing.id, ...payload }, opts)
    else create.mutate(payload, opts)
  })

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text c="dimmed" size="sm">
          Track signup-bonus offers available on card types — what you could go get.
        </Text>
        <Group gap="xs">
          <FileButton onChange={onPickFile} accept="text/csv,.csv">
            {(props) => (
              <Button
                {...props}
                variant="default"
                leftSection={<IconUpload size={16} />}
                loading={importCsv.isPending}
              >
                Import CSV
              </Button>
            )}
          </FileButton>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openCreate}
            disabled={(products.data ?? []).length === 0}
          >
            Add offer
          </Button>
        </Group>
      </Group>

      {offers.data && offers.data.length === 0 ? (
        <EmptyState
          title="No offers tracked"
          description="Add the current signup-bonus offers for cards you're considering."
        />
      ) : (
        <Table highlightOnHover withTableBorder verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Card</Table.Th>
              <Table.Th>Reward</Table.Th>
              <Table.Th>Value</Table.Th>
              <Table.Th>Min spend</Table.Th>
              <Table.Th>Window</Table.Th>
              <Table.Th>Expires</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {offers.data?.map((o) => (
              <Table.Tr key={o.id}>
                <Table.Td fw={500}>
                  {o.product ? `${o.product.issuer?.name ?? ''} ${o.product.name}`.trim() : '—'}
                </Table.Td>
                <Table.Td>
                  {o.cashAmountCents != null
                    ? formatCents(o.cashAmountCents)
                    : o.pointsAmount != null
                      ? `${formatPoints(o.pointsAmount)} ${o.currency ?? o.pointProgram?.name ?? 'pts'}`
                      : '—'}
                </Table.Td>
                <Table.Td fw={600}>{formatCents(o.valueCents)}</Table.Td>
                <Table.Td>{formatCents(o.minSpendCents)}</Table.Td>
                <Table.Td>{o.windowMonths ? `${o.windowMonths} mo` : '—'}</Table.Td>
                <Table.Td>{formatDate(o.expires)}</Table.Td>
                <Table.Td>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray">
                        <IconDots size={18} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => openEdit(o)}>
                        Edit
                      </Menu.Item>
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={16} />}
                        onClick={() => {
                          if (window.confirm('Delete this offer?')) remove.mutate({ id: o.id })
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
        title={editing ? 'Edit offer' : 'Add offer'}
        size="lg"
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
          <Select
            label="Reward kind"
            data={REWARD_KINDS as unknown as string[]}
            {...form.getInputProps('rewardKind')}
            mb="sm"
          />
          {isCash ? (
            <NumberInput
              label="Cash bonus ($)"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              {...form.getInputProps('cashDollars')}
              mb="sm"
            />
          ) : (
            <SimpleGrid cols={3} mb="sm">
              <NumberInput
                label="Points / miles"
                min={0}
                thousandSeparator=","
                {...form.getInputProps('pointsAmount')}
              />
              <TextInput
                label="Currency"
                placeholder="Amex MR, United miles…"
                {...form.getInputProps('currency')}
              />
              <NumberInput
                label="Value (¢/point)"
                min={0}
                step={0.1}
                decimalScale={2}
                {...form.getInputProps('pointValueCpp')}
              />
            </SimpleGrid>
          )}
          <Alert color={preview != null ? 'teal' : 'gray'} variant="light" mb="sm">
            <Text size="sm">
              Estimated value: <strong>{formatCents(preview)}</strong>
            </Text>
          </Alert>
          <SimpleGrid cols={3} mb="sm">
            <NumberInput
              label="Min spend ($)"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              {...form.getInputProps('minSpendDollars')}
            />
            <NumberInput label="Window (months)" min={0} {...form.getInputProps('windowMonths')} />
            <DateInput
              label="Offer expires"
              valueFormat="YYYY-MM-DD"
              clearable
              {...form.getInputProps('expires')}
            />
          </SimpleGrid>
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
