import React from 'react'
import { TextInput, NumberInput, Select, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { POINT_PROGRAM_KINDS } from '@shared/constants'
import type { PointProgramRow } from '../lib/types'
import { FormFooter } from './FormFooter'

export interface PointProgramFormValue {
  name: string
  ownerPersonId: number | null
  kind: (typeof POINT_PROGRAM_KINDS)[number] | null
  valuationCpp: number | null
  balance: number | null
  notes: string | null
}

interface Option {
  value: string
  label: string
}

export function PointProgramForm({
  initial,
  peopleOptions,
  submitting,
  onSubmit,
  onCancel
}: {
  initial: PointProgramRow | null
  peopleOptions: Option[]
  submitting: boolean
  onSubmit: (value: PointProgramFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: {
      name: initial?.name ?? '',
      ownerPersonId: initial?.ownerPersonId ? String(initial.ownerPersonId) : '',
      kind: initial?.kind ?? '',
      valuationCpp: initial?.valuationCpp ?? ('' as number | ''),
      balance: initial?.balance ?? ('' as number | ''),
      notes: initial?.notes ?? ''
    },
    validate: { name: (v) => (v.trim() ? null : 'Name is required') }
  })

  const submit = form.onSubmit((v) =>
    onSubmit({
      name: v.name.trim(),
      ownerPersonId: v.ownerPersonId ? Number(v.ownerPersonId) : null,
      kind: (v.kind || null) as (typeof POINT_PROGRAM_KINDS)[number] | null,
      valuationCpp: v.valuationCpp === '' ? null : Number(v.valuationCpp),
      balance: v.balance === '' ? null : Number(v.balance),
      notes: v.notes || null
    })
  )

  return (
    <form onSubmit={submit}>
      <TextInput label="Name" withAsterisk {...form.getInputProps('name')} mb="sm" />
      <Select
        label="Owner"
        data={peopleOptions}
        searchable
        clearable
        {...form.getInputProps('ownerPersonId')}
        mb="sm"
      />
      <Select
        label="Kind"
        data={POINT_PROGRAM_KINDS as unknown as string[]}
        clearable
        {...form.getInputProps('kind')}
        mb="sm"
      />
      <NumberInput
        label="Valuation (¢ per point)"
        description="e.g. 1.5 for typical transferable points"
        min={0}
        step={0.1}
        decimalScale={3}
        {...form.getInputProps('valuationCpp')}
        mb="sm"
      />
      <NumberInput
        label="Current balance (points)"
        min={0}
        thousandSeparator=","
        {...form.getInputProps('balance')}
        mb="sm"
      />
      <Textarea label="Notes" autosize minRows={2} {...form.getInputProps('notes')} mb="md" />
      <FormFooter editing={initial != null} submitting={submitting} onCancel={onCancel} />
    </form>
  )
}
