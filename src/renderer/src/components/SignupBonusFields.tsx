import React from 'react'
import { Divider, NumberInput, Select, SimpleGrid, Switch, Text } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import type { UseFormReturnType } from '@mantine/form'
import { REWARD_KINDS, type RewardKind } from '@shared/constants'
import { bonusValueCents, centsToDollars, formatCents, parseCents } from '@shared/format'
import { addDays, dateToIso } from '@shared/dates'

/**
 * The signup-bonus section shared by every add-card flow (personal drawer and
 * business wizard): a "Signup bonus" switch revealing reward, spend target,
 * and deadline fields, with the deadline derived from open date + window.
 */

/** Bonus fields the host form must include (plus `openedDate: Date | null`). */
export interface SignupBonusFormFields {
  hasBonus: boolean
  rewardKind: RewardKind
  pointProgramId: string
  pointsAmount: number | ''
  cashDollars: number | ''
  targetSpendDollars: number | ''
  deadline: Date | null
  windowDays: number | ''
}

export const EMPTY_BONUS_FIELDS: SignupBonusFormFields = {
  hasBonus: false,
  rewardKind: 'points',
  pointProgramId: '',
  pointsAmount: '',
  cashDollars: '',
  targetSpendDollars: '',
  deadline: null,
  windowDays: ''
}

interface OfferLike {
  rewardKind?: string | null
  pointProgramId?: number | null
  pointsAmount?: number | null
  cashAmountCents?: number | null
  minSpendCents?: number | null
  windowMonths?: number | null
}

/** Host forms differ in their other fields, so the form is typed loosely;
 *  the bonus field names above are the shared contract. */
type BonusHostForm = UseFormReturnType<SignupBonusFormFields & { openedDate: Date | null } & Record<string, unknown>>

/** UseFormReturnType is invariant over its value shape, so host forms can't
 *  pass themselves directly; this cast asserts they include the bonus fields
 *  (host form types extend SignupBonusFormFields, keeping it honest). */
export function asBonusHost(form: {
  values: SignupBonusFormFields & { openedDate: Date | null }
}): BonusHostForm {
  return form as BonusHostForm
}

/** Prefill the bonus section from a known offer for the chosen product. */
export function applyOfferToBonusFields(form: BonusHostForm, offer: OfferLike | undefined): void {
  if (!offer) return
  form.setFieldValue('hasBonus', true)
  form.setFieldValue('rewardKind', (offer.rewardKind ?? 'points') as RewardKind)
  form.setFieldValue('pointProgramId', offer.pointProgramId ? String(offer.pointProgramId) : '')
  form.setFieldValue('pointsAmount', offer.pointsAmount ?? '')
  form.setFieldValue('cashDollars', centsToDollars(offer.cashAmountCents))
  form.setFieldValue('targetSpendDollars', centsToDollars(offer.minSpendCents))
  // Offers store the window in months; the bonus deadline is tracked in days.
  const days = offer.windowMonths != null ? offer.windowMonths * 30 : null
  form.setFieldValue('windowDays', days ?? '')
  form.setFieldValue('deadline', addDays(form.values.openedDate, days))
}

/** Set the open date and recompute the deadline (open + window). */
export function syncDeadlineToOpened(form: BonusHostForm, date: Date | null): void {
  form.setFieldValue('openedDate', date)
  const days = form.values.windowDays
  if (days !== '') form.setFieldValue('deadline', addDays(date, Number(days)))
}

/** bonuses.create payload (minus cardId) from submitted values; null when no bonus. */
export function bonusPayloadFromFields(v: SignupBonusFormFields): {
  rewardKind: RewardKind
  pointProgramId: number | null
  pointsAmount: number | null
  cashAmountCents: number | null
  targetSpendCents: number | null
  deadline: string | null
  spendSoFarCents: number
  received: boolean
} | null {
  if (!v.hasBonus) return null
  const isCash = v.rewardKind === 'cash'
  return {
    rewardKind: v.rewardKind,
    pointProgramId: !isCash && v.pointProgramId ? Number(v.pointProgramId) : null,
    pointsAmount: !isCash && v.pointsAmount !== '' ? Number(v.pointsAmount) : null,
    cashAmountCents: isCash ? parseCents(v.cashDollars) : null,
    targetSpendCents: parseCents(v.targetSpendDollars),
    deadline: dateToIso(v.deadline),
    spendSoFarCents: 0,
    received: false
  }
}

export function SignupBonusFields({
  form,
  programOptions
}: {
  form: BonusHostForm
  programOptions: { value: string; label: string; valuationCpp: number | null }[]
}): React.ReactElement {
  const v = form.values
  const isCash = v.rewardKind === 'cash'
  const selectedProgram = programOptions.find((p) => p.value === v.pointProgramId)
  const bonusPreview = bonusValueCents({
    cashAmountCents: isCash ? parseCents(v.cashDollars) : null,
    pointsAmount: v.pointsAmount === '' ? null : Number(v.pointsAmount),
    valuationCpp: selectedProgram?.valuationCpp ?? null
  })

  // Let the user type a window in days; it sets the deadline from the open date.
  const onWindowChange = (value: number | string): void => {
    const days = value === '' ? '' : Number(value)
    form.setFieldValue('windowDays', days)
    if (days !== '') form.setFieldValue('deadline', addDays(v.openedDate, Number(days)))
  }

  return (
    <>
      <Divider
        my="sm"
        label={<Switch label="Signup bonus" {...form.getInputProps('hasBonus', { type: 'checkbox' })} />}
      />

      {v.hasBonus && (
        <>
          <SimpleGrid cols={2} mb="sm">
            <Select
              label="Reward kind"
              data={REWARD_KINDS as unknown as string[]}
              {...form.getInputProps('rewardKind')}
            />
            {isCash ? (
              <NumberInput
                label="Cash bonus ($)"
                min={0}
                decimalScale={2}
                thousandSeparator=","
                {...form.getInputProps('cashDollars')}
              />
            ) : (
              <NumberInput
                label="Points / miles"
                min={0}
                thousandSeparator=","
                {...form.getInputProps('pointsAmount')}
              />
            )}
          </SimpleGrid>
          {!isCash && (
            <Select
              label="Point program (for value)"
              data={programOptions}
              searchable
              clearable
              {...form.getInputProps('pointProgramId')}
              mb="sm"
            />
          )}
          <SimpleGrid cols={3} mb="sm">
            <NumberInput
              label="Spend target ($)"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              {...form.getInputProps('targetSpendDollars')}
            />
            <NumberInput
              label="Window (days)"
              description="Sets the deadline"
              min={0}
              value={v.windowDays}
              onChange={onWindowChange}
            />
            <DateInput
              label="Spend deadline"
              description="From open date + window"
              valueFormat="YYYY-MM-DD"
              clearable
              {...form.getInputProps('deadline')}
            />
          </SimpleGrid>
          <Text size="sm" c="dimmed" mb="sm">
            Estimated bonus value: <strong>{formatCents(bonusPreview)}</strong>
          </Text>
        </>
      )}
    </>
  )
}
