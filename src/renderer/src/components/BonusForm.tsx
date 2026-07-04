import React from 'react'
import {
  Select,
  NumberInput,
  TextInput,
  Textarea,
  Switch,
  SimpleGrid,
  Group,
  Button,
  Divider,
  Alert,
  Text
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { REWARD_KINDS, type RewardKind } from '@shared/constants'
import {
  centsToDollars,
  parseCents,
  formatCents,
  bonusValueCents,
  addDays,
  daysBetween
} from '@shared/format'
import { isoToDate, dateToIso } from '../lib/dates'
import type { BonusRow } from '../lib/types'

export interface BonusFormValue {
  cardId: number
  rewardKind: RewardKind | null
  pointProgramId: number | null
  pointsAmount: number | null
  cashAmountCents: number | null
  targetSpendCents: number | null
  spendSoFarCents: number
  startDate: string | null
  deadline: string | null
  received: boolean
  referralBonus: string | null
  notes: string | null
}

interface Option {
  value: string
  label: string
}

export function BonusForm({
  initial,
  cardOptions,
  programOptions,
  submitting,
  onSubmit,
  onCancel
}: {
  /** Row being edited (or a partial stub carrying a preselected cardId). */
  initial?: Partial<BonusRow>
  cardOptions: Option[]
  programOptions: { value: string; label: string; valuationCpp: number | null }[]
  submitting: boolean
  onSubmit: (value: BonusFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: {
      cardId: initial?.cardId != null ? String(initial.cardId) : '',
      rewardKind: (initial?.rewardKind as RewardKind | null) ?? 'points',
      pointProgramId: initial?.pointProgramId != null ? String(initial.pointProgramId) : '',
      pointsAmount: initial?.pointsAmount ?? ('' as number | ''),
      cashAmountDollars: centsToDollars(initial?.cashAmountCents),
      targetSpendDollars: centsToDollars(initial?.targetSpendCents),
      spendSoFarDollars: centsToDollars(initial?.spendSoFarCents) || 0,
      startDate: isoToDate(initial?.startDate),
      deadline: isoToDate(initial?.deadline),
      windowDays: daysBetween(isoToDate(initial?.startDate), isoToDate(initial?.deadline)) ?? ('' as number | ''),
      received: initial?.received ?? false,
      referralBonus: initial?.referralBonus ?? '',
      notes: initial?.notes ?? ''
    },
    validate: { cardId: (v) => (v ? null : 'Card is required') }
  })

  // The spend window (in days) drives the deadline: deadline = (start || today) + window.
  const applyWindow = (start: Date | null, days: number | ''): void => {
    if (days === '') return
    form.setFieldValue('deadline', addDays(start ?? new Date(), Number(days)))
  }
  const onWindowChange = (value: number | string): void => {
    const days = value === '' ? '' : Number(value)
    form.setFieldValue('windowDays', days)
    applyWindow(form.values.startDate, days)
  }
  const onStartChange = (date: Date | null): void => {
    form.setFieldValue('startDate', date)
    applyWindow(date, form.values.windowDays)
  }
  // Editing the deadline by hand keeps the window field in sync.
  const onDeadlineChange = (date: Date | null): void => {
    form.setFieldValue('deadline', date)
    form.setFieldValue('windowDays', daysBetween(form.values.startDate, date) ?? '')
  }

  const isCash = form.values.rewardKind === 'cash'
  const selectedProgram = programOptions.find((p) => p.value === form.values.pointProgramId)
  const previewValue = bonusValueCents({
    cashAmountCents: isCash ? parseCents(form.values.cashAmountDollars) : null,
    pointsAmount: form.values.pointsAmount === '' ? null : Number(form.values.pointsAmount),
    valuationCpp: selectedProgram?.valuationCpp ?? null
  })

  const submit = form.onSubmit((v) =>
    onSubmit({
      cardId: Number(v.cardId),
      rewardKind: v.rewardKind as RewardKind,
      pointProgramId: !isCash && v.pointProgramId ? Number(v.pointProgramId) : null,
      pointsAmount: !isCash && v.pointsAmount !== '' ? Number(v.pointsAmount) : null,
      cashAmountCents: isCash ? parseCents(v.cashAmountDollars) : null,
      targetSpendCents: parseCents(v.targetSpendDollars),
      spendSoFarCents: parseCents(v.spendSoFarDollars) ?? 0,
      startDate: dateToIso(v.startDate),
      deadline: dateToIso(v.deadline),
      received: v.received,
      referralBonus: v.referralBonus || null,
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
          {...form.getInputProps('cashAmountDollars')}
          mb="sm"
        />
      ) : (
        <SimpleGrid cols={2} mb="sm">
          <Select
            label="Point program"
            data={programOptions}
            searchable
            clearable
            description="Drives the bonus value"
            {...form.getInputProps('pointProgramId')}
          />
          <NumberInput
            label="Points / miles"
            min={0}
            thousandSeparator=","
            {...form.getInputProps('pointsAmount')}
          />
        </SimpleGrid>
      )}

      <Alert color={previewValue != null ? 'teal' : 'gray'} mb="sm" variant="light">
        <Text size="sm">
          Computed value: <strong>{formatCents(previewValue)}</strong>
          {!isCash && selectedProgram?.valuationCpp == null && (
            <Text span c="dimmed">
              {' '}
              — set a valuation on the program to compute this
            </Text>
          )}
        </Text>
      </Alert>

      <Divider my="sm" label="Minimum spend" />
      <SimpleGrid cols={2} mb="sm">
        <NumberInput
          label="Spend target ($)"
          min={0}
          decimalScale={2}
          thousandSeparator=","
          {...form.getInputProps('targetSpendDollars')}
        />
        <NumberInput
          label="Spent so far ($)"
          min={0}
          decimalScale={2}
          thousandSeparator=","
          {...form.getInputProps('spendSoFarDollars')}
        />
      </SimpleGrid>
      <SimpleGrid cols={3} mb="sm">
        <DateInput
          label="Start"
          valueFormat="YYYY-MM-DD"
          clearable
          value={form.values.startDate}
          onChange={onStartChange}
        />
        <NumberInput
          label="Window (days)"
          description="Sets the deadline"
          min={0}
          value={form.values.windowDays}
          onChange={onWindowChange}
        />
        <DateInput
          label="Deadline"
          valueFormat="YYYY-MM-DD"
          clearable
          value={form.values.deadline}
          onChange={onDeadlineChange}
        />
      </SimpleGrid>

      <TextInput
        label="Referral bonus (optional)"
        placeholder="e.g. 10,000 to referrer"
        {...form.getInputProps('referralBonus')}
        mb="sm"
      />
      <Switch
        label="Bonus received"
        {...form.getInputProps('received', { type: 'checkbox' })}
        mb="sm"
      />
      <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} mb="md" />

      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Save bonus
        </Button>
      </Group>
    </form>
  )
}
