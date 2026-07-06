import React from 'react'
import {
  TextInput,
  NumberInput,
  Select,
  Switch,
  Textarea,
  Group,
  Button,
  SimpleGrid,
  Divider
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { CARD_STATUSES, CARD_STATUS_LABELS, NETWORKS, type CardStatus } from '@shared/constants'
import { centsToDollars, parseCents } from '@shared/format'
import { isoToDate, dateToIso } from '@shared/dates'

export interface CardFormValue {
  cardProductId: number | null
  ownerPersonId: number | null
  businessId: number | null
  network: string | null
  last4: string | null
  annualFeeCents: number | null
  status: CardStatus
  autopay: boolean
  reportsToPersonal: boolean
  appliedDate: string | null
  openedDate: string | null
  closedDate: string | null
  rawCreditorName: string | null
  notes: string | null
}

interface Option {
  value: string
  label: string
}

export function CardForm({
  initial,
  productOptions,
  peopleOptions,
  businessOptions,
  submitting,
  onSubmit,
  onCancel
}: {
  initial?: Partial<CardFormValue>
  productOptions: Option[]
  peopleOptions: Option[]
  businessOptions: Option[]
  submitting: boolean
  onSubmit: (value: CardFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: {
      cardProductId: initial?.cardProductId != null ? String(initial.cardProductId) : '',
      ownerPersonId: initial?.ownerPersonId != null ? String(initial.ownerPersonId) : '',
      businessId: initial?.businessId != null ? String(initial.businessId) : '',
      network: initial?.network ?? '',
      last4: initial?.last4 ?? '',
      annualFeeDollars: centsToDollars(initial?.annualFeeCents),
      status: initial?.status ?? 'open',
      autopay: initial?.autopay ?? false,
      reportsToPersonal: initial?.reportsToPersonal ?? false,
      appliedDate: isoToDate(initial?.appliedDate),
      openedDate: isoToDate(initial?.openedDate),
      closedDate: isoToDate(initial?.closedDate),
      notes: initial?.notes ?? ''
    }
  })

  const submit = form.onSubmit((v) => {
    onSubmit({
      cardProductId: v.cardProductId ? Number(v.cardProductId) : null,
      ownerPersonId: v.ownerPersonId ? Number(v.ownerPersonId) : null,
      businessId: v.businessId ? Number(v.businessId) : null,
      network: v.network || null,
      last4: v.last4 || null,
      annualFeeCents: parseCents(v.annualFeeDollars),
      status: v.status as CardStatus,
      autopay: v.autopay,
      reportsToPersonal: v.reportsToPersonal,
      appliedDate: dateToIso(v.appliedDate),
      openedDate: dateToIso(v.openedDate),
      closedDate: dateToIso(v.closedDate),
      rawCreditorName: initial?.rawCreditorName ?? null,
      notes: v.notes || null
    })
  })

  return (
    <form onSubmit={submit}>
      <Select
        label="Product (from catalog)"
        placeholder="Match to a known card — leave blank if unknown"
        data={productOptions}
        searchable
        clearable
        {...form.getInputProps('cardProductId')}
        mb="sm"
      />
      <SimpleGrid cols={2} mb="sm">
        <Select
          label="Owner"
          placeholder="Whose card"
          data={peopleOptions}
          searchable
          clearable
          {...form.getInputProps('ownerPersonId')}
        />
        <Select
          label="Business"
          placeholder="Personal if blank"
          data={businessOptions}
          searchable
          clearable
          {...form.getInputProps('businessId')}
        />
      </SimpleGrid>
      <Select
        label="Status"
        data={CARD_STATUSES.map((s) => ({ value: s, label: CARD_STATUS_LABELS[s] }))}
        {...form.getInputProps('status')}
        mb="sm"
      />
      <SimpleGrid cols={3} mb="sm">
        <Select
          label="Network"
          data={NETWORKS as unknown as string[]}
          clearable
          {...form.getInputProps('network')}
        />
        <TextInput label="Last 4–5" maxLength={5} {...form.getInputProps('last4')} />
        <NumberInput
          label="Annual fee ($)"
          min={0}
          decimalScale={2}
          thousandSeparator=","
          {...form.getInputProps('annualFeeDollars')}
        />
      </SimpleGrid>

      <Divider my="sm" label="Dates" />
      <SimpleGrid cols={3} mb="sm">
        <DateInput
          label="Applied"
          valueFormat="YYYY-MM-DD"
          clearable
          {...form.getInputProps('appliedDate')}
        />
        <DateInput
          label="Opened"
          valueFormat="YYYY-MM-DD"
          clearable
          defaultDate={new Date()}
          {...form.getInputProps('openedDate')}
        />
        <DateInput
          label="Closed"
          valueFormat="YYYY-MM-DD"
          clearable
          {...form.getInputProps('closedDate')}
        />
      </SimpleGrid>

      <Switch
        label="Automatic payments set up"
        description="Autopay configured with the issuer"
        {...form.getInputProps('autopay', { type: 'checkbox' })}
        mb="sm"
      />
      <Switch
        label="Counts toward 5/24"
        description="For business cards that report to the personal bureaus (Capital One, Discover, TD…). Personal cards always count."
        {...form.getInputProps('reportsToPersonal', { type: 'checkbox' })}
        mb="sm"
      />
      <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} mb="md" />

      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Save card
        </Button>
      </Group>
    </form>
  )
}
