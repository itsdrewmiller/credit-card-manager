import React from 'react'
import { TextInput, NumberInput, Select, Textarea, Group, Button, SimpleGrid } from '@mantine/core'
import { useForm } from '@mantine/form'
import { RECURRING_PERIODS, type RecurringPeriod } from '@shared/constants'
import { centsToDollars, parseCents } from '@shared/format'
import type { RecurringPaymentRow } from '../lib/types'

export interface RecurringPaymentFormValue {
  name: string
  cardId: number | null
  amountCents: number | null
  period: RecurringPeriod | null
  notes: string | null
}

interface Option {
  value: string
  label: string
}

export function RecurringPaymentForm({
  initial,
  cardOptions,
  submitting,
  onSubmit,
  onCancel
}: {
  initial: RecurringPaymentRow | null
  cardOptions: Option[]
  submitting: boolean
  onSubmit: (value: RecurringPaymentFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: {
      name: initial?.name ?? '',
      cardId: initial?.cardId ? String(initial.cardId) : '',
      amountDollars: centsToDollars(initial?.amountCents),
      period: (initial?.period as RecurringPeriod | null) ?? 'monthly',
      notes: initial?.notes ?? ''
    },
    validate: { name: (v) => (v.trim() ? null : 'Name is required') }
  })

  const submit = form.onSubmit((v) =>
    onSubmit({
      name: v.name.trim(),
      cardId: v.cardId ? Number(v.cardId) : null,
      amountCents: parseCents(v.amountDollars),
      period: (v.period || null) as RecurringPeriod | null,
      notes: v.notes || null
    })
  )

  return (
    <form onSubmit={submit}>
      <TextInput
        label="Name"
        withAsterisk
        placeholder="Netflix, electric bill, gym…"
        {...form.getInputProps('name')}
        mb="sm"
      />
      <Select
        label="Billed to card"
        placeholder="Which card is on file"
        data={cardOptions}
        searchable
        clearable
        {...form.getInputProps('cardId')}
        mb="sm"
      />
      <SimpleGrid cols={2} mb="sm">
        <NumberInput
          label="Amount ($)"
          min={0}
          decimalScale={2}
          thousandSeparator=","
          {...form.getInputProps('amountDollars')}
        />
        <Select
          label="Period"
          data={RECURRING_PERIODS as unknown as string[]}
          {...form.getInputProps('period')}
        />
      </SimpleGrid>
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
