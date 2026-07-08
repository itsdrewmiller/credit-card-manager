import React from 'react'
import { Select, NumberInput, TextInput, Textarea, SimpleGrid, Alert, Text } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { REWARD_KINDS, type RewardKind } from '@shared/constants'
import { centsToDollars, parseCents, formatCents, pointsValueCents } from '@shared/format'
import { isoToDate, dateToIso } from '@shared/dates'
import type { OfferRow } from '../lib/types'
import { FormFooter } from './FormFooter'

export interface OfferFormValue {
  cardProductId: number
  rewardKind: RewardKind
  currency: string | null
  pointProgramId: number | null
  pointsAmount: number | null
  cashAmountCents: number | null
  pointValueCpp: number | null
  referralValueCents: number | null
  minSpendCents: number | null
  windowMonths: number | null
  expires: string | null
  notes: string | null
}

interface Option {
  value: string
  label: string
}

export function OfferForm({
  initial,
  productOptions,
  programs,
  submitting,
  onSubmit,
  onCancel
}: {
  initial: OfferRow | null
  productOptions: Option[]
  /** Point programs with valuations, for the live value preview. */
  programs: { id: number; valuationCpp: number | null }[]
  submitting: boolean
  onSubmit: (value: OfferFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: {
      cardProductId: initial ? String(initial.cardProductId) : '',
      rewardKind: (initial?.rewardKind ?? 'points') as RewardKind,
      currency: initial?.currency ?? '',
      pointProgramId: initial?.pointProgramId ? String(initial.pointProgramId) : '',
      pointsAmount: initial?.pointsAmount ?? ('' as number | ''),
      cashDollars: centsToDollars(initial?.cashAmountCents),
      pointValueCpp: initial?.pointValueCpp ?? ('' as number | ''),
      referralValueDollars: centsToDollars(initial?.referralValueCents),
      minSpendDollars: centsToDollars(initial?.minSpendCents),
      windowMonths: initial?.windowMonths ?? ('' as number | ''),
      expires: isoToDate(initial?.expires),
      notes: initial?.notes ?? ''
    },
    validate: { cardProductId: (v) => (v ? null : 'Pick a card') }
  })

  const isCash = form.values.rewardKind === 'cash'
  const selectedProgram = programs.find((p) => String(p.id) === form.values.pointProgramId)
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

  const submit = form.onSubmit((v) =>
    onSubmit({
      cardProductId: Number(v.cardProductId),
      rewardKind: v.rewardKind,
      currency: v.currency || null,
      pointProgramId: !isCash && v.pointProgramId ? Number(v.pointProgramId) : null,
      pointsAmount: !isCash && v.pointsAmount !== '' ? Number(v.pointsAmount) : null,
      cashAmountCents: isCash ? parseCents(v.cashDollars) : null,
      pointValueCpp: v.pointValueCpp === '' ? null : Number(v.pointValueCpp),
      referralValueCents: parseCents(v.referralValueDollars),
      minSpendCents: parseCents(v.minSpendDollars),
      windowMonths: v.windowMonths === '' ? null : Number(v.windowMonths),
      expires: dateToIso(v.expires),
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
        <SimpleGrid cols={{ base: 1, sm: 3 }} mb="sm">
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
      <NumberInput
        label="Referral value ($)"
        description="What the referrer earns — counted in household recommendations"
        min={0}
        decimalScale={2}
        thousandSeparator=","
        {...form.getInputProps('referralValueDollars')}
        mb="sm"
      />
      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="sm">
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
      <FormFooter editing={initial != null} submitting={submitting} onCancel={onCancel} />
    </form>
  )
}
