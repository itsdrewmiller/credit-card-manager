import React from 'react'
import { Select, TextInput, NumberInput, Textarea, Switch, SimpleGrid, Group, Divider, Stack } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { BENEFIT_PERIODS, type BenefitPeriod } from '@shared/constants'
import { centsToDollars, parseCents } from '@shared/format'
import { isoToDate, dateToIso } from '@shared/dates'
import type { BenefitRow } from '../lib/types'
import { FormFooter } from './FormFooter'

export interface BenefitFormValue {
  cardId: number
  name: string
  category: string | null
  amountCents: number | null
  valuePct: number | null
  period: BenefitPeriod | null
  year: number | null
  useAfter: string | null
  useBy: string | null
  used: boolean
  usedAmountCents: number | null
  confirmed: boolean
  isSubscription: boolean
  notes: string | null
}

interface Option {
  value: string
  label: string
}

export function BenefitForm({
  initial,
  cardOptions,
  submitting,
  onSubmit,
  onCancel
}: {
  /** Row being edited (or a partial stub carrying a preselected cardId). */
  initial?: Partial<BenefitRow>
  cardOptions: Option[]
  submitting: boolean
  onSubmit: (value: BenefitFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: {
      cardId: initial?.cardId != null ? String(initial.cardId) : '',
      name: initial?.name ?? '',
      category: initial?.category ?? '',
      amountDollars: centsToDollars(initial?.amountCents),
      valuePct: initial?.valuePct ?? ('' as number | ''),
      period: (initial?.period as BenefitPeriod | null) ?? '',
      year: initial?.year ?? ('' as number | ''),
      useAfter: isoToDate(initial?.useAfter),
      useBy: isoToDate(initial?.useBy),
      used: initial?.used ?? false,
      usedAmountDollars: centsToDollars(initial?.usedAmountCents),
      confirmed: initial?.confirmed ?? false,
      isSubscription: initial?.isSubscription ?? false,
      notes: initial?.notes ?? ''
    },
    validate: {
      cardId: (v) => (v ? null : 'Card is required'),
      name: (v) => (v.trim() ? null : 'Name is required')
    }
  })

  const submit = form.onSubmit((v) =>
    onSubmit({
      cardId: Number(v.cardId),
      name: v.name.trim(),
      category: v.category || null,
      amountCents: parseCents(v.amountDollars),
      valuePct: v.valuePct === '' ? null : Number(v.valuePct),
      period: (v.period || null) as BenefitPeriod | null,
      year: v.year === '' ? null : Number(v.year),
      useAfter: dateToIso(v.useAfter),
      useBy: dateToIso(v.useBy),
      used: v.used,
      usedAmountCents: parseCents(v.usedAmountDollars),
      confirmed: v.confirmed,
      isSubscription: v.isSubscription,
      notes: v.notes || null
    })
  )

  return (
    <form onSubmit={submit}>
      <Select
        label="Card"
        withAsterisk
        data={cardOptions}
        searchable
        {...form.getInputProps('cardId')}
        mb="sm"
      />
      <TextInput label="Benefit name" withAsterisk {...form.getInputProps('name')} mb="sm" />
      <SimpleGrid cols={2} mb="sm">
        <TextInput
          label="Category"
          placeholder="Dining, Travel, …"
          {...form.getInputProps('category')}
        />
        <Select
          label="Period"
          data={BENEFIT_PERIODS as unknown as string[]}
          clearable
          {...form.getInputProps('period')}
        />
      </SimpleGrid>
      <SimpleGrid cols={3} mb="sm">
        <NumberInput
          label="Value ($)"
          min={0}
          decimalScale={2}
          {...form.getInputProps('amountDollars')}
        />
        <NumberInput
          label="Worth to you (%)"
          description="Blank = full face value"
          min={0}
          max={100}
          suffix="%"
          {...form.getInputProps('valuePct')}
        />
        <NumberInput label="Year" min={2000} max={2100} {...form.getInputProps('year')} />
      </SimpleGrid>

      <Divider my="sm" label="Usage window" />
      <SimpleGrid cols={2} mb="sm">
        <DateInput
          label="Use after"
          valueFormat="YYYY-MM-DD"
          clearable
          {...form.getInputProps('useAfter')}
        />
        <DateInput
          label="Use by"
          valueFormat="YYYY-MM-DD"
          clearable
          {...form.getInputProps('useBy')}
        />
      </SimpleGrid>

      <Stack gap="xs" mb="md">
        <Group align="center" gap="md">
          <Switch label="Used" {...form.getInputProps('used', { type: 'checkbox' })} />
          <NumberInput
            size="xs"
            w={140}
            min={0}
            decimalScale={2}
            prefix="$"
            placeholder="Used so far"
            aria-label="Amount used so far"
            {...form.getInputProps('usedAmountDollars')}
          />
        </Group>
        <Switch
          label="Confirmed (verified the credit posted)"
          {...form.getInputProps('confirmed', { type: 'checkbox' })}
        />
        <Switch
          label="Subscription (auto-recurring)"
          {...form.getInputProps('isSubscription', { type: 'checkbox' })}
        />
      </Stack>

      <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} mb="md" />
      <FormFooter editing={initial != null} submitting={submitting} onCancel={onCancel} />
    </form>
  )
}
