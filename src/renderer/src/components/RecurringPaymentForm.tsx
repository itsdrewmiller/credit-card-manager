import React from 'react'
import { TextInput, Select, Textarea, Group, Button } from '@mantine/core'
import { useForm } from '@mantine/form'
import type { RecurringPaymentRow } from '../lib/types'

export interface RecurringPaymentFormValue {
  name: string
  cardId: number | null
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
      notes: initial?.notes ?? ''
    },
    validate: { name: (v) => (v.trim() ? null : 'Name is required') }
  })

  const submit = form.onSubmit((v) =>
    onSubmit({
      name: v.name.trim(),
      cardId: v.cardId ? Number(v.cardId) : null,
      notes: v.notes || null
    })
  )

  return (
    <form onSubmit={submit}>
      <TextInput
        label="Merchant / service"
        withAsterisk
        placeholder="Amazon, Netflix, electric bill…"
        {...form.getInputProps('name')}
        mb="sm"
      />
      <Select
        label="Default card"
        placeholder="Which card it charges"
        data={cardOptions}
        searchable
        clearable
        {...form.getInputProps('cardId')}
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
