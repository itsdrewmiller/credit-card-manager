import React from 'react'
import { TextInput, Textarea, Group, Button } from '@mantine/core'
import { useForm } from '@mantine/form'
import type { PersonRow } from '../lib/types'

export interface PersonFormValue {
  name: string
  notes: string | null
}

export function PersonForm({
  initial,
  submitting,
  onSubmit,
  onCancel
}: {
  initial: PersonRow | null
  submitting: boolean
  onSubmit: (value: PersonFormValue) => void
  onCancel: () => void
}): React.ReactElement {
  const form = useForm({
    initialValues: { name: initial?.name ?? '', notes: initial?.notes ?? '' },
    validate: { name: (v) => (v.trim() ? null : 'Name is required') }
  })

  const submit = form.onSubmit((v) => onSubmit({ name: v.name.trim(), notes: v.notes || null }))

  return (
    <form onSubmit={submit}>
      <TextInput label="Name" withAsterisk {...form.getInputProps('name')} mb="sm" />
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
