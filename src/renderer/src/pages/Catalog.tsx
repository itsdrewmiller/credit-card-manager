import React, { useState } from 'react'
import {
  Table,
  Button,
  Modal,
  TextInput,
  NumberInput,
  Select,
  Switch,
  Group,
  Badge,
  Text
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconPlus } from '@tabler/icons-react'
import { trpc } from '../trpc'
import { PageHeader } from '../components/PageHeader'
import { NETWORKS } from '@shared/constants'
import { formatCents, parseCents } from '@shared/format'

export function Catalog(): React.ReactElement {
  const utils = trpc.useUtils()
  const products = trpc.products.list.useQuery()
  const issuers = trpc.issuers.list.useQuery()
  const [opened, setOpened] = useState(false)

  const form = useForm({
    initialValues: {
      issuerId: '',
      name: '',
      network: '',
      isBusiness: false,
      annualFeeDollars: '' as number | ''
    },
    validate: {
      issuerId: (v) => (v ? null : 'Issuer is required'),
      name: (v) => (v.trim() ? null : 'Name is required')
    }
  })

  const create = trpc.products.create.useMutation({
    onSuccess: () => {
      void utils.products.list.invalidate()
      void utils.products.listForSelect.invalidate()
      void utils.system.health.invalidate()
      setOpened(false)
      notifications.show({ message: 'Product added to catalog' })
    },
    onError: (e) => notifications.show({ color: 'red', message: e.message })
  })

  const submit = form.onSubmit((v) =>
    create.mutate({
      issuerId: Number(v.issuerId),
      name: v.name.trim(),
      network: v.network || null,
      isBusiness: v.isBusiness,
      defaultAnnualFeeCents: parseCents(v.annualFeeDollars)
    })
  )

  const issuerOptions = (issuers.data ?? []).map((i) => ({ value: String(i.id), label: i.name }))

  return (
    <>
      <PageHeader
        title="Card catalog"
        badge={products.data ? `${products.data.length} products` : undefined}
      >
        <Button leftSection={<IconPlus size={16} />} onClick={() => setOpened(true)}>
          Add product
        </Button>
      </PageHeader>
      <Text c="dimmed" mb="md">
        Known card products. Used to match imported credit-report tradelines and (later) to suggest
        which cards to open.
      </Text>

      <Table highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Issuer</Table.Th>
            <Table.Th>Product</Table.Th>
            <Table.Th>Network</Table.Th>
            <Table.Th>Annual fee</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Aliases</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {products.data?.map((p) => (
            <Table.Tr key={p.id}>
              <Table.Td>{p.issuer?.name}</Table.Td>
              <Table.Td fw={500}>{p.name}</Table.Td>
              <Table.Td>{p.network}</Table.Td>
              <Table.Td>{formatCents(p.defaultAnnualFeeCents)}</Table.Td>
              <Table.Td>
                {p.isBusiness ? (
                  <Badge variant="light" color="indigo">
                    Business
                  </Badge>
                ) : (
                  <Badge variant="light" color="gray">
                    Personal
                  </Badge>
                )}
              </Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed">
                  {p.aliases.length}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Add catalog product">
        <form onSubmit={submit}>
          <Select
            label="Issuer"
            withAsterisk
            data={issuerOptions}
            searchable
            {...form.getInputProps('issuerId')}
            mb="sm"
          />
          <TextInput label="Product name" withAsterisk {...form.getInputProps('name')} mb="sm" />
          <Select
            label="Network"
            data={NETWORKS as unknown as string[]}
            clearable
            {...form.getInputProps('network')}
            mb="sm"
          />
          <NumberInput
            label="Default annual fee ($)"
            min={0}
            decimalScale={2}
            {...form.getInputProps('annualFeeDollars')}
            mb="sm"
          />
          <Switch
            label="Business card"
            {...form.getInputProps('isBusiness', { type: 'checkbox' })}
            mb="md"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Add
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  )
}
