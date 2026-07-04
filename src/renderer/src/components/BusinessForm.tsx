import React from 'react'
import { TextInput, Textarea, Select, Group, Button } from '@mantine/core'
import { useForm } from '@mantine/form'
import { BUSINESS_TYPES } from '@shared/constants'
import type { BusinessRow } from '../lib/types'

export interface BusinessFormValue {
  name: string
  ownerPersonId: number
  type: string | null
  notes: string | null
}

interface Option {
  value: string
  label: string
}

export function BusinessForm({
  initial,
  peopleOptions,
  submitting,
  onSubmit,
  onCancel
}: {
  initial: BusinessRow | null
  peopleOptions: Option[]
  submitting: boolean
  onSubmit: (value: BusinessFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: {
      name: initial?.name ?? '',
      ownerPersonId: initial ? String(initial.ownerPersonId) : '',
      type: initial?.type ?? '',
      notes: initial?.notes ?? ''
    },
    validate: {
      name: (v) => (v.trim() ? null : 'Name is required'),
      ownerPersonId: (v) => (v ? null : 'Owner is required')
    }
  })

  const submit = form.onSubmit((v) =>
    onSubmit({
      name: v.name.trim(),
      ownerPersonId: Number(v.ownerPersonId),
      type: v.type || null,
      notes: v.notes || null
    })
  )

  return (
    <form onSubmit={submit}>
      <TextInput label="Name" withAsterisk {...form.getInputProps('name')} mb="sm" />
      <Select
        label="Owner"
        withAsterisk
        data={peopleOptions}
        searchable
        {...form.getInputProps('ownerPersonId')}
        mb="sm"
      />
      <Select
        label="Type"
        data={BUSINESS_TYPES as unknown as string[]}
        clearable
        {...form.getInputProps('type')}
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
