import React from 'react'
import { TextInput, NumberInput, Select, Textarea, Group, Button, SimpleGrid } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { REFERRAL_STATUSES, type ReferralStatus } from '@shared/constants'
import { centsToDollars, parseCents } from '@shared/format'
import { isoToDate, dateToIso } from '@shared/dates'
import type { ReferralRow } from '../lib/types'

export interface ReferralFormValue {
  fromPersonId: number
  toPersonId: number | null
  cardProductId: number | null
  link: string | null
  rewardAmount: string | null
  rewardValueCents: number | null
  date: string | null
  status: ReferralStatus | null
  notes: string | null
}

interface Option {
  value: string
  label: string
}

export function ReferralForm({
  initial,
  peopleOptions,
  productOptions,
  submitting,
  onSubmit,
  onCancel
}: {
  initial: ReferralRow | null
  peopleOptions: Option[]
  productOptions: Option[]
  submitting: boolean
  onSubmit: (value: ReferralFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: {
      fromPersonId: initial ? String(initial.fromPersonId) : '',
      toPersonId: initial?.toPersonId ? String(initial.toPersonId) : '',
      cardProductId: initial?.cardProductId ? String(initial.cardProductId) : '',
      link: initial?.link ?? '',
      rewardAmount: initial?.rewardAmount ?? '',
      rewardValueDollars: centsToDollars(initial?.rewardValueCents),
      date: isoToDate(initial?.date),
      status: initial?.status ?? '',
      notes: initial?.notes ?? ''
    },
    validate: { fromPersonId: (v) => (v ? null : 'Referrer is required') }
  })

  const submit = form.onSubmit((v) =>
    onSubmit({
      fromPersonId: Number(v.fromPersonId),
      toPersonId: v.toPersonId ? Number(v.toPersonId) : null,
      cardProductId: v.cardProductId ? Number(v.cardProductId) : null,
      link: v.link || null,
      rewardAmount: v.rewardAmount || null,
      rewardValueCents: parseCents(v.rewardValueDollars),
      date: dateToIso(v.date),
      status: (v.status || null) as ReferralStatus | null,
      notes: v.notes || null
    })
  )

  return (
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
      <TextInput label="Link" placeholder="https://…" {...form.getInputProps('link')} mb="sm" />
      <SimpleGrid cols={3} mb="sm">
        <TextInput
          label="Reward"
          placeholder="e.g. 20,000 pts"
          {...form.getInputProps('rewardAmount')}
        />
        <NumberInput
          label="Reward value ($)"
          description="Counted in Reports once paid"
          min={0}
          decimalScale={2}
          thousandSeparator=","
          {...form.getInputProps('rewardValueDollars')}
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
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {initial ? 'Save' : 'Add'}
        </Button>
      </Group>
    </form>
  )
}
