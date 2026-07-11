import React from 'react'
import { Select, NumberInput, TextInput, Textarea, Switch, SimpleGrid, Group, Divider, Alert, Text } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { REWARD_KINDS, type RewardKind } from '@shared/constants'
import { centsToDollars, parseCents, formatCents, bonusValueCents } from '@shared/format'
import { addDays, daysBetween, isoToDate, dateToIso } from '@shared/dates'
import type { BonusRow } from '../lib/types'
import { FormFooter } from './FormFooter'

export interface BonusFormValue {
  cardId: number
  rewardKind: RewardKind | null
  pointProgramId: number | null
  pointsAmount: number | null
  cashAmountCents: number | null
  targetSpendCents: number | null
  spendSoFarCents: number
  deadline: string | null
  received: boolean
  receivedDate: string | null
  referralBonus: string | null
  notes: string | null
}

interface Option {
  value: string
  label: string
  /** The card's open date — the bonus window always starts there. */
  openedDate?: string | null
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
      deadline: isoToDate(initial?.deadline),
      windowDays: daysBetween(isoToDate(initial?.card?.openedDate), isoToDate(initial?.deadline)) ?? ('' as number | ''),
      received: initial?.received ?? false,
      receivedDate: isoToDate(initial?.receivedDate),
      referralBonus: initial?.referralBonus ?? '',
      notes: initial?.notes ?? ''
    },
    validate: { cardId: (v) => (v ? null : 'Card is required') }
  })

  // The window always starts at the card's open date (today until one is set).
  const windowStart = (cardId: string): Date | null =>
    isoToDate(cardOptions.find((o) => o.value === cardId)?.openedDate) ?? new Date()

  // The spend window (in days) drives the deadline: deadline = open date + window.
  const onWindowChange = (value: number | string): void => {
    const days = value === '' ? '' : Number(value)
    form.setFieldValue('windowDays', days)
    if (days !== '') {
      form.setFieldValue('deadline', addDays(windowStart(form.values.cardId), Number(days)))
    }
  }
  // Switching cards moves the window start, so re-derive the window field.
  const onCardChange = (cardId: string | null): void => {
    form.setFieldValue('cardId', cardId ?? '')
    if (cardId && form.values.deadline) {
      form.setFieldValue('windowDays', daysBetween(windowStart(cardId), form.values.deadline) ?? '')
    }
  }
  // Editing the deadline by hand keeps the window field in sync.
  const onDeadlineChange = (date: Date | null): void => {
    form.setFieldValue('deadline', date)
    form.setFieldValue('windowDays', daysBetween(windowStart(form.values.cardId), date) ?? '')
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
      deadline: dateToIso(v.deadline),
      received: v.received,
      receivedDate: dateToIso(v.receivedDate),
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
        onChange={onCardChange}
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
        <SimpleGrid cols={{ base: 1, sm: 2 }} mb="sm">
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
      <SimpleGrid cols={{ base: 1, sm: 2 }} mb="sm">
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
      <SimpleGrid cols={{ base: 1, sm: 2 }} mb="sm">
        <NumberInput
          label="Window (days)"
          description="Sets the deadline from the card's open date"
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
      <Group align="flex-end" mb="sm">
        <Switch
          label="Bonus received"
          {...form.getInputProps('received', { type: 'checkbox' })}
        />
        {form.values.received && (
          <DateInput
            label="Received on"
            description="When the points/cash posted (drives Reports)"
            valueFormat="YYYY-MM-DD"
            clearable
            {...form.getInputProps('receivedDate')}
          />
        )}
      </Group>
      <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} mb="md" />

      <FormFooter editing={initial != null} submitting={submitting} onCancel={onCancel} />
    </form>
  )
}
