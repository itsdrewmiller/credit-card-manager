import React from 'react'
import { Select, TextInput, NumberInput, Textarea, Group, Button } from '@mantine/core'
import { useForm } from '@mantine/form'
import { BENEFIT_PERIODS, type BenefitPeriod } from '@shared/constants'
import { centsToDollars, parseCents } from '@shared/format'
import type { ProductBenefitRow } from '../lib/types'

export interface ProductBenefitFormValue {
  cardProductId: number
  name: string
  category: string | null
  amountCents: number | null
  period: BenefitPeriod | null
  notes: string | null
}

interface Option {
  value: string
  label: string
}

export function ProductBenefitForm({
  initial,
  productOptions,
  submitting,
  onSubmit,
  onCancel
}: {
  initial: ProductBenefitRow | null
  productOptions: Option[]
  submitting: boolean
  onSubmit: (value: ProductBenefitFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: {
      cardProductId: initial ? String(initial.cardProductId) : '',
      name: initial?.name ?? '',
      category: initial?.category ?? '',
      amountDollars: centsToDollars(initial?.amountCents),
      period: initial?.period ?? '',
      notes: initial?.notes ?? ''
    },
    validate: {
      cardProductId: (v) => (v ? null : 'Pick a card'),
      name: (v) => (v.trim() ? null : 'Name is required')
    }
  })

  const submit = form.onSubmit((v) =>
    onSubmit({
      cardProductId: Number(v.cardProductId),
      name: v.name.trim(),
      category: v.category || null,
      amountCents: parseCents(v.amountDollars),
      period: (v.period || null) as BenefitPeriod | null,
      notes: v.notes || null
    })
  )

  return (
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
